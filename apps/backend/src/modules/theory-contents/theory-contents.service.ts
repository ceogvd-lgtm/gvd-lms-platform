import { ContentType, Role } from '@lms/database';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { ContentKind } from '../../common/storage/storage.constants';
import { UploadService } from '../storage/upload.service';

import { SaveBodyDto, UpsertTheoryDto } from './dto/upsert-theory.dto';
import { PptConverterService, SlideDeck } from './ppt-converter.service';

interface Actor {
  id: string;
  role: Role;
}

/**
 * Public DTO returned by the API. JSON columns typed as `unknown` so the
 * Prisma `JsonValue` runtime type doesn't leak into emitted `.d.ts`
 * (TS otherwise refuses to emit the type without a portable reference).
 */
export interface TheoryContentDto {
  id: string;
  lessonId: string;
  overview: string;
  objectives: unknown;
  contentType: ContentType;
  contentUrl: string;
  duration: number | null;
  completionThreshold: number;
  body: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Map the Phase 12 /upload endpoint's `kind` string to the existing
 * {@link ContentKind} expected by {@link UploadService.uploadContent}.
 *
 * The frontend sends SCORM / XAPI / VIDEO / POWERPOINT — upload.service
 * only knows SCORM / PPT / VIDEO / WEBGL. Both SCORM and xAPI are zip
 * archives so we stash xAPI under the SCORM prefix (cheap — same MIME
 * rules) and remember the logical type on `TheoryContent.contentType`.
 */
const UPLOAD_KIND_MAP: Record<'SCORM' | 'XAPI' | 'POWERPOINT' | 'VIDEO', ContentKind> = {
  SCORM: 'SCORM',
  XAPI: 'SCORM',
  POWERPOINT: 'PPT',
  VIDEO: 'VIDEO',
};

/**
 * CRUD for `TheoryContent`.
 *
 * Phase 10 — base CRUD (findByLesson, upsert, saveBody).
 * Phase 12 — content upload (SCORM/xAPI/PPT/VIDEO), PPT slide conversion,
 *            slide retrieval, and lesson-completion check (invoked by
 *            SCORM/xAPI/Video modules when their own completion criterion
 *            fires).
 *
 * Ownership rule (mirrors LessonsService.assertOwnership Phase 04):
 *   - INSTRUCTOR may only touch theory content of lessons that belong
 *     to a course where they are the instructor.
 *   - ADMIN+ bypasses ownership.
 */
@Injectable()
export class TheoryContentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService,
    private readonly pptConverter: PptConverterService,
  ) {}

  // =====================================================
  // Helpers
  // =====================================================
  private async assertLessonOwnership(actor: Actor, lessonId: string): Promise<void> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      include: {
        chapter: { include: { course: { select: { instructorId: true } } } },
      },
    });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === lesson.chapter.course.instructorId) {
      return;
    }
    throw new ForbiddenException('Bạn không có quyền với bài giảng này');
  }

  /**
   * Permission check used by STUDENT-visible endpoints (slides, progress).
   * Any authenticated user may read a published lesson's slides — the
   * instructor ownership rule doesn't apply.
   */
  private async assertLessonExists(lessonId: string): Promise<void> {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, isDeleted: true },
    });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }
  }

  // =====================================================
  // GET — returns null if no content exists yet
  // =====================================================
  async findByLesson(actor: Actor, lessonId: string): Promise<TheoryContentDto | null> {
    await this.assertLessonOwnership(actor, lessonId);
    return this.prisma.client.theoryContent.findUnique({
      where: { lessonId },
    }) as Promise<TheoryContentDto | null>;
  }

  // =====================================================
  // UPSERT — create on first save, update on subsequent saves
  // =====================================================
  async upsert(actor: Actor, lessonId: string, dto: UpsertTheoryDto): Promise<TheoryContentDto> {
    await this.assertLessonOwnership(actor, lessonId);

    return this.prisma.client.theoryContent.upsert({
      where: { lessonId },
      update: {
        overview: dto.overview,
        objectives: dto.objectives as never,
        contentType: dto.contentType,
        contentUrl: dto.contentUrl,
        duration: dto.duration,
        completionThreshold: dto.completionThreshold ?? undefined,
        body: (dto.body ?? null) as never,
      },
      create: {
        lessonId,
        overview: dto.overview,
        objectives: dto.objectives as never,
        contentType: dto.contentType,
        contentUrl: dto.contentUrl,
        duration: dto.duration,
        completionThreshold: dto.completionThreshold ?? 0.8,
        body: (dto.body ?? null) as never,
      },
    }) as Promise<TheoryContentDto>;
  }

  // =====================================================
  // SAVE BODY — auto-save endpoint, partial update of body only
  // =====================================================
  async saveBody(actor: Actor, lessonId: string, dto: SaveBodyDto): Promise<TheoryContentDto> {
    await this.assertLessonOwnership(actor, lessonId);

    // If theory content doesn't exist yet, we create a stub so auto-save
    // can succeed before the user has filled in the rest of the form.
    return this.prisma.client.theoryContent.upsert({
      where: { lessonId },
      update: { body: dto.body as never },
      create: {
        lessonId,
        overview: '',
        objectives: [] as never,
        contentType: 'PDF',
        contentUrl: '',
        body: dto.body as never,
      },
    }) as Promise<TheoryContentDto>;
  }

  // =====================================================
  // UPLOAD — Phase 12: upload a content payload and wire its URL to the
  //   TheoryContent row. For SCORM and xAPI the controller is expected to
  //   hand off to ScormService/XapiService next (which parse imsmanifest
  //   / tincan.xml) — this method just does the raw upload + DB write.
  // =====================================================
  async uploadContent(
    actor: Actor,
    lessonId: string,
    kind: 'SCORM' | 'XAPI' | 'POWERPOINT' | 'VIDEO',
    file: Express.Multer.File,
  ): Promise<{ content: TheoryContentDto; fileUrl: string; fileKey: string }> {
    await this.assertLessonOwnership(actor, lessonId);

    const mapped: ContentKind = UPLOAD_KIND_MAP[kind];
    const result = await this.uploads.uploadContent(actor.id, mapped, lessonId, file);

    // Map the logical kind to the DB enum. XAPI rides in a SCORM-shaped zip
    // so storage-wise it's identical, but TheoryContent.contentType records
    // the logical type so the student renderer picks the right component.
    const contentType: ContentType =
      kind === 'XAPI'
        ? 'XAPI'
        : kind === 'POWERPOINT'
          ? 'POWERPOINT'
          : kind === 'VIDEO'
            ? 'VIDEO'
            : 'SCORM';

    const saved = (await this.prisma.client.theoryContent.upsert({
      where: { lessonId },
      update: {
        contentType,
        contentUrl: result.fileUrl,
      },
      create: {
        lessonId,
        overview: '',
        objectives: [] as never,
        contentType,
        contentUrl: result.fileUrl,
      },
    })) as TheoryContentDto;

    return { content: saved, fileUrl: result.fileUrl, fileKey: result.fileKey };
  }

  // =====================================================
  // CONVERT PPT — rasterise uploaded .pptx into a slide deck. Delegated
  //   to PptConverterService which handles both the happy LibreOffice
  //   path and the fallback (no converter installed) case.
  // =====================================================
  async convertPpt(actor: Actor, lessonId: string, sourceKey: string): Promise<SlideDeck> {
    await this.assertLessonOwnership(actor, lessonId);

    if (!sourceKey.startsWith('content/ppt/')) {
      throw new BadRequestException(
        'sourceKey phải nằm trong content/ppt/ — hãy upload PPT qua endpoint /upload trước.',
      );
    }

    try {
      return await this.pptConverter.convert(lessonId, sourceKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Convert PPT thất bại';
      if (msg.includes('not found in storage')) {
        throw new NotFoundException(msg);
      }
      throw err;
    }
  }

  // =====================================================
  // GET SLIDES — any authenticated user may fetch the deck of a lesson
  //   that has one. Returns null if the lesson has never been converted.
  // =====================================================
  async getSlides(lessonId: string): Promise<SlideDeck | null> {
    await this.assertLessonExists(lessonId);
    return this.pptConverter.getDeck(lessonId);
  }
}
