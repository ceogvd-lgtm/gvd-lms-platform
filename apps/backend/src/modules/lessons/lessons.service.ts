import { ProgressStatus, Role } from '@lms/database';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  forwardRef,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { extractMinioKey } from '../../common/storage/storage.utils';
import { GEMINI_QUEUE } from '../ai/ai.constants';
import { QuotaService } from '../ai/quota.service';
import { CertificatesService } from '../certificates/certificates.service';
import { ProgressService } from '../progress/progress.service';
import { XpReason, XpService } from '../students/xp.service';

import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

interface Actor {
  id: string;
  role: Role;
}

interface RequestMeta {
  ip: string;
}

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly xp: XpService,
    // Phase 15 — keeps CourseEnrollment.progressPercent in sync with
    // LessonProgress. forwardRef because ProgressModule imports this
    // module indirectly via the controller dependency graph.
    @Inject(forwardRef(() => ProgressService))
    private readonly progress: ProgressService,
    // Phase 16 — tries to auto-issue a certificate after every lesson
    // completion transition. Fire-and-forget; the service handles its
    // own idempotency (ALREADY_ISSUED short-circuit).
    private readonly certificates: CertificatesService,
    // Phase 18 — cleanup file mồ côi trên MinIO khi soft-delete lesson.
    private readonly storage: StorageService,
    // Phase 18 — auto-index PDF attachments vào ChromaDB cho RAG. Inject
    // QuotaService để check read-only trước khi enqueue (tránh burn quota
    // nếu free tier sắp đầy); BullMQ queue dùng chung GEMINI_QUEUE.
    @InjectQueue(GEMINI_QUEUE) private readonly geminiQueue: Queue,
    private readonly quota: QuotaService,
  ) {}

  private async findLessonWithCourse(id: string) {
    return this.prisma.client.lesson.findUnique({
      where: { id },
      include: {
        chapter: {
          include: {
            course: { select: { id: true, instructorId: true } },
          },
        },
      },
    });
  }

  private assertOwnership(actor: Actor, courseInstructorId: string): void {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === courseInstructorId) return;
    throw new ForbiddenException('Bạn không có quyền với bài giảng này');
  }

  // =====================================================
  // CREATE under a chapter (nested route)
  // =====================================================
  async createInChapter(actor: Actor, chapterId: string, dto: Omit<CreateLessonDto, 'chapterId'>) {
    const chapter = await this.prisma.client.chapter.findUnique({
      where: { id: chapterId },
      include: { course: { select: { instructorId: true } } },
    });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');
    this.assertOwnership(actor, chapter.course.instructorId);

    const last = await this.prisma.client.lesson.findFirst({
      where: { chapterId, isDeleted: false },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.client.lesson.create({
      data: {
        chapterId,
        title: dto.title,
        type: dto.type,
        order: (last?.order ?? -1) + 1,
      },
    });
  }

  // Backward-compat: flat POST /lessons still works (Phase 04 API).
  async create(actor: Actor, dto: CreateLessonDto) {
    return this.createInChapter(actor, dto.chapterId, {
      title: dto.title,
      type: dto.type,
      order: dto.order,
    });
  }

  // =====================================================
  // UPDATE
  // =====================================================
  async update(actor: Actor, id: string, dto: UpdateLessonDto) {
    const lesson = await this.findLessonWithCourse(id);
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }
    this.assertOwnership(actor, lesson.chapter.course.instructorId);

    return this.prisma.client.lesson.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
      },
    });
  }

  // =====================================================
  // REORDER lesson within its chapter
  // =====================================================
  async reorder(actor: Actor, id: string, newOrder: number) {
    const lesson = await this.findLessonWithCourse(id);
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }
    this.assertOwnership(actor, lesson.chapter.course.instructorId);

    const siblings = await this.prisma.client.lesson.findMany({
      where: { chapterId: lesson.chapterId, isDeleted: false },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    const without = siblings.filter((l) => l.id !== id);
    const clamped = Math.min(Math.max(0, newOrder), without.length);
    const next = [...without.slice(0, clamped), { id }, ...without.slice(clamped)];

    await this.prisma.client.$transaction(
      next.map((l, idx) =>
        this.prisma.client.lesson.update({
          where: { id: l.id },
          data: { order: idx },
        }),
      ),
    );

    return { message: 'Đã cập nhật thứ tự bài giảng', lessons: next };
  }

  // =====================================================
  // DELETE (soft, ADMIN+ only) — CLAUDE.md: INSTRUCTOR TUYỆT ĐỐI KHÔNG XOÁ
  // =====================================================
  async softDelete(actor: Actor, id: string, meta: RequestMeta) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền xoá bài giảng');
    }

    // Phase 18 — select thêm các URL files để có thể cleanup khỏi MinIO
    // sau khi xoá record. Dùng `include` để join sang theoryContent /
    // practiceContent / attachments trong 1 roundtrip.
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id },
      include: {
        theoryContent: { select: { contentUrl: true } },
        practiceContent: { select: { webglUrl: true } },
        attachments: { select: { fileUrl: true } },
      },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    if (lesson.isDeleted) {
      throw new NotFoundException('Bài giảng đã bị xoá');
    }

    const updated = await this.prisma.client.lesson.update({
      where: { id },
      data: { isDeleted: true },
      select: { id: true, title: true, isDeleted: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'LESSON_DELETE',
      targetType: 'Lesson',
      targetId: id,
      ipAddress: meta.ip,
      oldValue: { title: lesson.title, isDeleted: false },
      newValue: { title: updated.title, isDeleted: true },
    });

    // Option A — cleanup files mồ côi. Mỗi file try/catch riêng để
    // một failure không chặn những file khác. Không throw; cron weekly
    // (Option B) sẽ xử lý file còn sót.
    //
    // WebGL content có cấu trúc thư mục (loader.js + data + framework +
    // wasm + index.html) — dùng `deletePrefix` thay vì `delete` để dọn
    // sạch cả cây. `content/webgl/<id>/` là prefix theo convention upload.
    await this.cleanupFile(lesson.theoryContent?.contentUrl, `lesson ${id} theory`);
    await this.cleanupPracticeWebgl(lesson.practiceContent?.webglUrl, `lesson ${id} webgl`);
    for (const att of lesson.attachments) {
      await this.cleanupFile(att.fileUrl, `lesson ${id} attachment`);
    }

    return { message: 'Đã xoá bài giảng', lesson: updated };
  }

  private async cleanupFile(url: string | null | undefined, label: string): Promise<void> {
    const key = extractMinioKey(url);
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(
        `Storage cleanup failed for ${label} (key=${key}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * WebGL dùng nhiều file trong cùng thư mục (loader/data/framework/wasm
   * + index.html + data folder). URL thường trỏ tới `index.html`; ta
   * chuyển sang prefix chứa thư mục để xoá hết. Nếu không parse được
   * thì fallback sang cleanupFile.
   */
  private async cleanupPracticeWebgl(url: string | null | undefined, label: string): Promise<void> {
    const key = extractMinioKey(url);
    if (!key) return;
    // `content/webgl/<slug>/index.html` → prefix `content/webgl/<slug>/`
    const lastSlash = key.lastIndexOf('/');
    const prefix = lastSlash > 0 ? key.slice(0, lastSlash + 1) : null;
    if (!prefix || !prefix.startsWith('content/webgl/')) {
      // Không phải cây WebGL thông thường → xoá 1 file
      return this.cleanupFile(url, label);
    }
    try {
      await this.storage.deletePrefix(prefix);
    } catch (err) {
      this.logger.warn(
        `Storage cleanup failed for ${label} (prefix=${prefix}): ${(err as Error).message}`,
      );
    }
  }

  // =====================================================
  // STUDENT COMPLETION (Phase 12) — checks both content + quiz.
  //
  // A lesson is considered COMPLETED only when:
  //   (a) the content itself is done — tracked by the content-type-specific
  //       module (video → VideoProgress.isCompleted, SCORM/xAPI → a prior
  //       call to /track persisted LessonProgress.status = COMPLETED,
  //       PPT → the frontend signals "final slide reached" and hits this
  //       endpoint once)
  //   (b) if the lesson has a Quiz, the student has at least one
  //       QuizAttempt with score >= passScore.
  //
  // If either condition fails we return the current LessonProgress
  // unchanged — the frontend decides what to prompt the user next.
  // =====================================================
  async completeForStudent(studentId: string, lessonId: string) {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        isDeleted: true,
        // Phase 15 — include chapter.courseId so we can trigger the
        // CourseEnrollment rollup at the end without a second round-trip.
        chapter: { select: { courseId: true } },
        theoryContent: {
          select: {
            id: true,
            contentType: true,
            completionThreshold: true,
          },
        },
        quizzes: { select: { id: true, passScore: true } },
      },
    });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }

    const now = new Date();
    const contentDone = await this.isContentDone(studentId, lesson);
    if (!contentDone) {
      throw new BadRequestException(
        'Phần nội dung chính chưa hoàn thành — xem/hoàn tất nội dung trước.',
      );
    }

    // A lesson can have one quiz (schema: quizzes[] but we use at most one).
    const quiz = lesson.quizzes[0];
    if (quiz) {
      const best = await this.prisma.client.quizAttempt.aggregate({
        where: { quizId: quiz.id, studentId, completedAt: { not: null } },
        _max: { score: true },
      });
      const bestScore = best._max.score ?? 0;
      if (bestScore < quiz.passScore) {
        throw new BadRequestException(
          'Chưa đạt điểm pass của quiz — học viên cần làm bài kiểm tra trước.',
        );
      }
    }

    // First-time completion detector — we check BEFORE the upsert so the
    // XP award fires only on the transition NOT_STARTED/IN_PROGRESS → COMPLETED.
    const existing = await this.prisma.client.lessonProgress.findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
      select: { status: true },
    });
    const isFirstComplete = !existing || existing.status !== ProgressStatus.COMPLETED;

    const progress = await this.prisma.client.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      update: {
        status: ProgressStatus.COMPLETED,
        completedAt: now,
        lastViewAt: now,
      },
      create: {
        lessonId,
        studentId,
        status: ProgressStatus.COMPLETED,
        completedAt: now,
        lastViewAt: now,
      },
    });

    // Phase 14 — XP cascade.
    // 1. +10 XP for first-ever completion of this lesson.
    // 2. If this completion takes the WHOLE course to 100%, mark the
    //    enrollment.completedAt + award +100 XP once.
    //
    // We track which awards fired so the HTTP response can tell the
    // frontend which "+XP earned" toasts to show. `.catch(() => false)`
    // swallows the DB error but records "no XP given" — the original
    // design already treated XP as fire-and-forget.
    let lessonXpAwarded = false;
    let courseXpAwarded = false;
    if (isFirstComplete) {
      lessonXpAwarded = await this.xp
        .award(studentId, XpReason.LESSON_COMPLETED)
        .then(() => true)
        .catch(() => false);
      courseXpAwarded = await this.checkAndAwardCourseCompletion(studentId, lessonId).catch(
        () => false,
      );
    }

    // Phase 15 — keep CourseEnrollment.progressPercent + lastActiveAt in
    // sync so the dashboard rollup query doesn't have to recount lessons
    // on every read. Fire-and-forget — a calculation error shouldn't
    // block the HTTP response the UI is already waiting on.
    if (lesson.chapter?.courseId) {
      await this.progress
        .calculateCourseProgress(studentId, lesson.chapter.courseId)
        .catch(() => undefined);

      // Phase 16 — try to issue certificate if all criteria met. Only
      // fires on first completion to avoid re-issuance loops. The
      // service itself is idempotent (ALREADY_ISSUED short-circuits)
      // so even if both conditions below are true we can't
      // accidentally double-issue.
      if (isFirstComplete) {
        await this.certificates
          .checkAndIssueCertificate(studentId, lesson.chapter.courseId)
          .catch(() => undefined);
      }
    }

    return {
      ...progress,
      xpAwarded: {
        lesson: lessonXpAwarded ? 10 : 0,
        course: courseXpAwarded ? 100 : 0,
      },
    };
  }

  /**
   * When a student completes a lesson, see if the whole course is now
   * COMPLETED too. If yes, stamp CourseEnrollment.completedAt + award
   * the +100 XP bonus. Returns true iff the +100 XP bonus was awarded
   * on this call (caller uses it to trigger the client-side toast).
   * Returns false if not enrolled, already completed, or course isn't
   * at 100% yet.
   */
  private async checkAndAwardCourseCompletion(
    studentId: string,
    lessonId: string,
  ): Promise<boolean> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { chapter: { select: { courseId: true } } },
    });
    if (!lesson) return false;
    const courseId = lesson.chapter.courseId;

    const enrollment = await this.prisma.client.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!enrollment || enrollment.completedAt) return false;

    // Count total lessons in course + student's completed count.
    const chapters = await this.prisma.client.chapter.findMany({
      where: { courseId },
      select: { id: true },
    });
    const chapterIds = chapters.map((c) => c.id);
    const [total, completed] = await Promise.all([
      this.prisma.client.lesson.count({
        where: { chapterId: { in: chapterIds }, isDeleted: false },
      }),
      this.prisma.client.lessonProgress.count({
        where: {
          studentId,
          status: ProgressStatus.COMPLETED,
          lessonId: {
            in: (
              await this.prisma.client.lesson.findMany({
                where: { chapterId: { in: chapterIds }, isDeleted: false },
                select: { id: true },
              })
            ).map((l) => l.id),
          },
        },
      }),
    ]);
    if (total === 0 || completed < total) return false;

    await this.prisma.client.courseEnrollment.update({
      where: { id: enrollment.id },
      data: { completedAt: new Date() },
    });
    const awarded = await this.xp
      .award(studentId, XpReason.COURSE_COMPLETED)
      .then(() => true)
      .catch(() => false);
    return awarded;
  }

  /**
   * Determine if the lesson's *primary content* is done.
   *
   * The check is content-type-specific because each engine stores its
   * own state:
   *   - VIDEO → VideoProgress.isCompleted === true
   *   - SCORM / XAPI / POWERPOINT / PDF → LessonProgress.status === COMPLETED
   *     (those engines write COMPLETED to LessonProgress directly when
   *     their own completion condition fires, so checking here is enough)
   *   - Lessons with no theory yet → delegate to LessonProgress
   */
  private async isContentDone(
    studentId: string,
    lesson: {
      id: string;
      theoryContent: {
        id: string;
        contentType: string;
        completionThreshold: number;
      } | null;
    },
  ): Promise<boolean> {
    if (!lesson.theoryContent) {
      // No content ⇒ nothing to wait on.
      return true;
    }

    if (lesson.theoryContent.contentType === 'VIDEO') {
      const vp = await this.prisma.client.videoProgress.findUnique({
        where: {
          theoryContentId_studentId: {
            theoryContentId: lesson.theoryContent.id,
            studentId,
          },
        },
        select: { isCompleted: true },
      });
      return vp?.isCompleted === true;
    }

    const lp = await this.prisma.client.lessonProgress.findUnique({
      where: { lessonId_studentId: { lessonId: lesson.id, studentId } },
      select: { status: true },
    });
    return lp?.status === ProgressStatus.COMPLETED;
  }

  // =====================================================
  // ATTACHMENTS (Phase 12) — read + create + delete.
  //
  // The raw file upload runs through /upload/attachment (Phase 06); this
  // layer just records a row in LessonAttachment so the student page can
  // list files per-lesson. Deletion is instructor-scoped to prevent a
  // rogue STUDENT from nuking a lesson's resources.
  // =====================================================
  async listAttachments(lessonId: string): Promise<
    Array<{
      id: string;
      lessonId: string;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      aiIndexed: boolean;
      aiIndexedAt: Date | null;
      createdAt: Date;
    }>
  > {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');
    const rows = await this.prisma.client.lessonAttachment.findMany({
      where: { lessonId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      lessonId: r.lessonId,
      fileName: r.fileName,
      fileUrl: r.fileUrl,
      fileSize: r.fileSize,
      mimeType: r.mimeType,
      aiIndexed: r.aiIndexed,
      aiIndexedAt: r.aiIndexedAt,
      createdAt: r.createdAt,
    }));
  }

  async createAttachment(
    actor: Actor,
    lessonId: string,
    payload: { fileName: string; fileUrl: string; fileSize: number; mimeType: string },
  ) {
    const lesson = await this.findLessonWithCourse(lessonId);
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');
    this.assertOwnership(actor, lesson.chapter.course.instructorId);

    const row = await this.prisma.client.lessonAttachment.create({
      data: { lessonId, ...payload },
    });

    // Phase 18 — auto-index PDF vào Chroma để Gemini trả lời theo nội dung
    // giáo trình thật. Fire-and-forget: upload vẫn thành công kể cả khi
    // quota đầy / queue fail / Chroma down. UI hiển thị aiIndexed flag.
    if (payload.mimeType === 'application/pdf') {
      await this.enqueuePdfIndex(row.id, lessonId, payload.fileUrl).catch((err) => {
        this.logger.warn(
          `Auto-index enqueue failed (non-fatal): attachmentId=${row.id} ${(err as Error).message}`,
        );
      });
    }

    return {
      id: row.id,
      lessonId: row.lessonId,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      aiIndexed: row.aiIndexed,
      aiIndexedAt: row.aiIndexedAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * Enqueue PDF indexing job if embedding quota cho phép. Không throw —
   * caller catch bên ngoài để upload vẫn thành công khi AI offline.
   */
  private async enqueuePdfIndex(
    attachmentId: string,
    lessonId: string,
    fileUrl: string,
  ): Promise<void> {
    const hasQuota = await this.quota.hasQuotaFor('embedding');
    if (!hasQuota) {
      this.logger.warn(
        `AI quota đầy hôm nay — skip auto-index attachmentId=${attachmentId} lessonId=${lessonId}`,
      );
      return;
    }
    await this.geminiQueue.add(
      'index-lesson-from-url',
      { lessonId, fileUrl, attachmentId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    this.logger.log(`Auto-index enqueued: attachmentId=${attachmentId} lessonId=${lessonId}`);
  }

  async deleteAttachment(actor: Actor, lessonId: string, attachmentId: string) {
    const lesson = await this.findLessonWithCourse(lessonId);
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');
    this.assertOwnership(actor, lesson.chapter.course.instructorId);

    const existing = await this.prisma.client.lessonAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, lessonId: true },
    });
    if (!existing || existing.lessonId !== lessonId) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }
    await this.prisma.client.lessonAttachment.delete({ where: { id: attachmentId } });
    return { message: 'Đã xoá tài liệu', id: attachmentId };
  }

  // =====================================================
  // GET student progress — bundles LessonProgress, VideoProgress, QuizAttempts
  //
  // Student-facing endpoint — callers always pass their own id, there's
  // no cross-student lookup here. Instructors hit /instructor/analytics
  // for broader views.
  // =====================================================
  async getProgressForStudent(studentId: string, lessonId: string): Promise<LessonStudentProgress> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true, theoryContent: { select: { id: true } } },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    const [progress, videoProgress, quizAttempts] = await Promise.all([
      this.prisma.client.lessonProgress.findUnique({
        where: { lessonId_studentId: { lessonId, studentId } },
      }),
      lesson.theoryContent
        ? this.prisma.client.videoProgress.findUnique({
            where: {
              theoryContentId_studentId: {
                theoryContentId: lesson.theoryContent.id,
                studentId,
              },
            },
          })
        : Promise.resolve(null),
      this.prisma.client.quizAttempt.findMany({
        where: { studentId, quiz: { lessonId } },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      progress: (progress ?? null) as unknown as LessonStudentProgress['progress'],
      videoProgress: (videoProgress ?? null) as unknown as LessonStudentProgress['videoProgress'],
      quizAttempts: quizAttempts as unknown as LessonStudentProgress['quizAttempts'],
    };
  }

  // =====================================================
  // GET lesson context — the lightweight metadata the lesson page needs
  // to render its sidebar (course outline) + prev/next navigation.
  //
  // Available to any authenticated user: the payload is just navigation
  // metadata (titles + IDs + order). Enrollment / ownership checks
  // happen at the content-fetch endpoints, not here.
  // =====================================================
  async getContext(lessonId: string): Promise<LessonContext> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        title: true,
        type: true,
        order: true,
        isDeleted: true,
        chapter: {
          select: {
            id: true,
            title: true,
            order: true,
            course: { select: { id: true, title: true } },
          },
        },
      },
    });
    if (!lesson || lesson.isDeleted) throw new NotFoundException('Không tìm thấy bài giảng');

    // Derive prev/next by walking the course in reading order. We run two
    // queries (chapters first, then lessons under those chapters) and sort
    // in JS because Prisma's relation-filter syntax here fights the
    // cross-relation orderBy we'd otherwise need.
    // NB: Chapter doesn't have an isDeleted column — only Lesson does.
    const chapters = await this.prisma.client.chapter.findMany({
      where: { courseId: lesson.chapter.course.id },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    });
    const chapterIdList = chapters.map((c) => c.id);
    const chapterOrderById = new Map(chapters.map((c) => [c.id, c.order]));

    const siblingsRaw = await this.prisma.client.lesson.findMany({
      where: { chapterId: { in: chapterIdList }, isDeleted: false },
      select: { id: true, title: true, chapterId: true, order: true },
    });
    const siblings = siblingsRaw.sort((a, b) => {
      const co =
        (chapterOrderById.get(a.chapterId) ?? 0) - (chapterOrderById.get(b.chapterId) ?? 0);
      return co !== 0 ? co : a.order - b.order;
    });
    const idx = siblings.findIndex((l) => l.id === lessonId);
    const prev = idx > 0 ? { id: siblings[idx - 1]!.id, title: siblings[idx - 1]!.title } : null;
    const next =
      idx >= 0 && idx < siblings.length - 1
        ? { id: siblings[idx + 1]!.id, title: siblings[idx + 1]!.title }
        : null;

    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        type: lesson.type as 'THEORY' | 'PRACTICE',
        order: lesson.order,
      },
      chapter: {
        id: lesson.chapter.id,
        title: lesson.chapter.title,
        order: lesson.chapter.order,
      },
      course: lesson.chapter.course,
      prev,
      next,
    };
  }
}

// =====================================================
// Response shapes for getProgressForStudent.
// Explicit interfaces so emitted declarations don't reference internal
// Prisma runtime types (non-portable — breaks tsc --noEmit).
// =====================================================
export interface LessonProgressRow {
  id: string;
  lessonId: string;
  studentId: string;
  status: ProgressStatus;
  score: number | null;
  timeSpent: number;
  attempts: number;
  lastViewAt: Date;
  completedAt: Date | null;
}

export interface VideoProgressRow {
  id: string;
  theoryContentId: string;
  studentId: string;
  watchedSeconds: number;
  duration: number;
  lastPosition: number;
  isCompleted: boolean;
  updatedAt: Date;
}

export interface QuizAttemptRow {
  id: string;
  quizId: string;
  studentId: string;
  score: number;
  maxScore: number;
  answers: unknown;
  startedAt: Date;
  completedAt: Date | null;
}

export interface LessonStudentProgress {
  progress: LessonProgressRow | null;
  videoProgress: VideoProgressRow | null;
  quizAttempts: QuizAttemptRow[];
}

// =====================================================
// Response shape for getContext — used by the student lesson page to
// render its outline sidebar + prev/next buttons, and by the instructor
// editor to discover the parent course so it can load the chapter tree.
// =====================================================
export interface LessonContext {
  lesson: { id: string; title: string; type: 'THEORY' | 'PRACTICE'; order: number };
  chapter: { id: string; title: string; order: number };
  course: { id: string; title: string };
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}
