import { randomUUID } from 'node:crypto';

import { CertificateStatus, ProgressStatus, Role } from '@lms/database';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PREFIXES } from '../../common/storage/storage.constants';
import { StorageService } from '../../common/storage/storage.service';
import { EmailService } from '../notifications/email.service';
import { NotificationsService } from '../notifications/notifications.service';

import {
  CertificateCriteriaService,
  DEFAULT_GRADE_THRESHOLDS,
} from './certificate-criteria.service';
import { renderCertificatePdf, type CertificatePdfInput } from './certificate-pdf.generator';
import { ListCertificatesDto } from './dto/list-certificates.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';

interface Actor {
  id: string;
  role: Role;
}

interface Meta {
  ip: string;
}

export interface IssueResult {
  issued: boolean;
  certificateId?: string;
  grade?: string;
  finalScore?: number;
  reason?: string;
}

const INSTITUTION_NAME = 'GVD next gen LMS';

/**
 * Admin certificate management (Phase 09) + auto-issue engine (Phase 16).
 *
 * The Phase 09 surface (list/findOne/revoke/stats) is unchanged. Phase
 * 16 adds:
 *   - `checkAndIssueCertificate`  — called from completion cascades
 *   - `issueManual`               — admin override for "this student
 *                                   clearly earned it but the automatic
 *                                   checks don't fit their path"
 *   - `getDownloadUrl`            — (re)generates the PDF on demand +
 *                                   returns a presigned MinIO URL
 *   - `verifyByCode`              — public lookup consumed by the
 *                                   Next.js `/verify/[code]` route
 *
 * Side-effect dependencies (NotificationsService, EmailService,
 * StorageService, CertificateCriteriaService) are wired via the
 * constructor. The email + notification + audit calls are all
 * fire-and-forget — a transient send error shouldn't block the
 * underlying lesson/quiz/practice completion.
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Phase 16 — new collaborators. Marked @Optional so existing tests
    // that only exercise list/revoke/stats can skip wiring them up.
    @Optional()
    @Inject(CertificateCriteriaService)
    private readonly criteria?: CertificateCriteriaService,
    @Optional()
    @Inject(StorageService)
    private readonly storage?: StorageService,
    @Optional()
    @Inject(NotificationsService)
    private readonly notifications?: NotificationsService,
    @Optional()
    @Inject(EmailService)
    private readonly email?: EmailService,
  ) {}

  // =====================================================
  // LIST with filters + pagination
  // =====================================================
  async list(dto: ListCertificatesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (dto.status) where.status = dto.status;
    if (dto.courseId) where.courseId = dto.courseId;
    if (dto.studentId) where.studentId = dto.studentId;

    if (dto.q) {
      where.OR = [
        { code: { contains: dto.q, mode: 'insensitive' } },
        { student: { name: { contains: dto.q, mode: 'insensitive' } } },
        { student: { email: { contains: dto.q, mode: 'insensitive' } } },
        { course: { title: { contains: dto.q, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.client.certificate.count({ where }),
      this.prisma.client.certificate.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true, thumbnailUrl: true } },
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =====================================================
  // FIND ONE
  // =====================================================
  async findOne(id: string) {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
        },
        course: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            subject: { select: { id: true, name: true, code: true } },
            instructor: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('Không tìm thấy chứng chỉ');
    return cert;
  }

  // =====================================================
  // REVOKE — requires reason
  // =====================================================
  async revoke(actor: Actor, id: string, dto: RevokeCertificateDto, meta: Meta) {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { id },
      select: { id: true, code: true, status: true, studentId: true, courseId: true },
    });
    if (!cert) throw new NotFoundException('Không tìm thấy chứng chỉ');
    if (cert.status === CertificateStatus.REVOKED) {
      throw new BadRequestException('Chứng chỉ đã bị thu hồi trước đó');
    }

    const updated = await this.prisma.client.certificate.update({
      where: { id },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: dto.reason,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'CERTIFICATE_REVOKE',
      targetType: 'Certificate',
      targetId: id,
      ipAddress: meta.ip,
      oldValue: { status: cert.status },
      newValue: { status: CertificateStatus.REVOKED, reason: dto.reason },
    });

    return updated;
  }

  // =====================================================
  // PASS RATE by course — for /admin/reports stats + /admin/certificates stats card
  // =====================================================
  async getPassRateByCourse() {
    // 1. Fetch all non-deleted, published courses
    const courses = await this.prisma.client.course.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        title: true,
        _count: { select: { enrollments: true, certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. For each course, count ACTIVE certificates
    const activeCerts = await this.prisma.client.certificate.groupBy({
      by: ['courseId'],
      where: { status: CertificateStatus.ACTIVE },
      _count: { _all: true },
    });
    const activeByCourse = new Map<string, number>();
    for (const row of activeCerts) {
      activeByCourse.set(row.courseId, row._count._all);
    }

    return {
      courses: courses.map((c) => {
        const enrolled = c._count.enrollments;
        const active = activeByCourse.get(c.id) ?? 0;
        const passRate = enrolled > 0 ? Math.round((active / enrolled) * 100) : 0;
        return {
          courseId: c.id,
          courseTitle: c.title,
          enrolled,
          passed: active,
          totalCertificates: c._count.certificates,
          passRate,
        };
      }),
    };
  }

  // =====================================================
  // STATS SUMMARY — total cards for the top of /admin/certificates
  // =====================================================
  async getStatsSummary() {
    const [active, revoked, expired, total] = await Promise.all([
      this.prisma.client.certificate.count({ where: { status: CertificateStatus.ACTIVE } }),
      this.prisma.client.certificate.count({ where: { status: CertificateStatus.REVOKED } }),
      this.prisma.client.certificate.count({ where: { status: CertificateStatus.EXPIRED } }),
      this.prisma.client.certificate.count(),
    ]);

    // Average pass-rate across all courses that have at least one enrollment
    const passRateData = await this.getPassRateByCourse();
    const coursesWithEnrollments = passRateData.courses.filter((c) => c.enrolled > 0);
    const avgPassRate =
      coursesWithEnrollments.length > 0
        ? Math.round(
            coursesWithEnrollments.reduce((sum, c) => sum + c.passRate, 0) /
              coursesWithEnrollments.length,
          )
        : 0;

    return { total, active, revoked, expired, avgPassRate };
  }

  // =====================================================
  // Phase 16 — AUTO-ISSUE ENGINE
  // =====================================================

  /**
   * Main entry point. Called from the three completion cascades
   * (lesson-complete, quiz-pass, practice-pass). Pure read-then-write:
   * if all criteria are met → insert a Certificate row, generate PDF,
   * fire side effects; otherwise return `{issued: false, reason}` so
   * the caller can decide whether to surface a message.
   *
   * Idempotent: once a student has an ACTIVE/EXPIRED cert for the
   * course we return early. (REVOKED certs DO allow re-issue — an
   * admin might revoke then manually re-issue a corrected version.)
   */
  async checkAndIssueCertificate(studentId: string, courseId: string): Promise<IssueResult> {
    // 1. Existing cert?
    const existing = await this.prisma.client.certificate.findFirst({
      where: {
        studentId,
        courseId,
        status: { in: [CertificateStatus.ACTIVE, CertificateStatus.EXPIRED] },
      },
      select: { id: true },
    });
    if (existing) return { issued: false, reason: 'ALREADY_ISSUED' };

    // 2. Criteria (falls back to defaults when no row exists)
    const criteria = this.criteria ? await this.criteria.get(courseId) : null;
    const minPassScore = criteria?.minPassScore ?? 70;
    const minProgress = criteria?.minProgress ?? 100;
    const minPracticeScore = criteria?.minPracticeScore ?? 0;
    const noSafetyViolation = criteria?.noSafetyViolation ?? true;
    const requiredLessons = criteria?.requiredLessons ?? [];
    const validityMonths = criteria?.validityMonths ?? null;
    const thresholds = criteria?.gradeThresholds ?? DEFAULT_GRADE_THRESHOLDS;

    // 3. Gather student's performance numbers
    const enrollment = await this.prisma.client.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
      select: { progressPercent: true, completedAt: true },
    });
    if (!enrollment) return { issued: false, reason: 'NOT_ENROLLED' };

    const quizAgg = await this.prisma.client.quizAttempt.aggregate({
      where: {
        studentId,
        completedAt: { not: null },
        quiz: { lesson: { chapter: { courseId } } },
      },
      _sum: { score: true, maxScore: true },
      _count: { _all: true },
    });
    const quizTotal = quizAgg._sum.score ?? 0;
    const quizMax = quizAgg._sum.maxScore ?? 0;
    const avgScore = quizMax > 0 ? Math.round((quizTotal / quizMax) * 100) : 0;

    const practiceAgg = await this.prisma.client.practiceAttempt.aggregate({
      where: {
        studentId,
        completedAt: { not: null },
        practiceContent: { lesson: { chapter: { courseId } } },
      },
      _sum: { score: true, maxScore: true },
      _count: { _all: true },
    });
    const practiceTotal = practiceAgg._sum.score ?? 0;
    const practiceMax = practiceAgg._sum.maxScore ?? 0;
    const practiceScore = practiceMax > 0 ? Math.round((practiceTotal / practiceMax) * 100) : 0;

    const hasViolation =
      (await this.prisma.client.practiceAttempt.count({
        where: {
          studentId,
          hasCriticalViolation: true,
          practiceContent: { lesson: { chapter: { courseId } } },
        },
      })) > 0;

    // 4. Evaluate each criterion — first failure short-circuits
    if (enrollment.progressPercent < minProgress) {
      return { issued: false, reason: `progress ${enrollment.progressPercent}% < ${minProgress}%` };
    }
    if (quizAgg._count._all > 0 && avgScore < minPassScore) {
      return { issued: false, reason: `avgScore ${avgScore}% < ${minPassScore}%` };
    }
    if (practiceAgg._count._all > 0 && practiceScore < minPracticeScore) {
      return {
        issued: false,
        reason: `practice ${practiceScore}% < ${minPracticeScore}%`,
      };
    }
    if (noSafetyViolation && hasViolation) {
      return { issued: false, reason: 'has critical safety violation' };
    }
    if (requiredLessons.length > 0) {
      const completedCount = await this.prisma.client.lessonProgress.count({
        where: {
          studentId,
          lessonId: { in: requiredLessons },
          status: ProgressStatus.COMPLETED,
        },
      });
      if (completedCount < requiredLessons.length) {
        return {
          issued: false,
          reason: `required lessons: ${completedCount}/${requiredLessons.length}`,
        };
      }
    }

    // 5. Compute final score + grade. We blend quiz and practice weights
    //    50/50 when both are present; fall back to whichever exists.
    const finalScore = this.computeFinalScore(
      avgScore,
      practiceScore,
      quizAgg._count._all,
      practiceAgg._count._all,
    );
    const grade = CertificatesService.calculateGrade(finalScore, thresholds);
    if (!grade) {
      return {
        issued: false,
        reason: `finalScore ${finalScore}% < passThreshold ${thresholds.pass}%`,
      };
    }

    // 6. Create Certificate row — does NOT block on PDF generation or
    //    side-effects so the HTTP completion flow stays snappy.
    const code = randomUUID().toUpperCase();
    const expiresAt =
      validityMonths != null
        ? new Date(Date.now() + validityMonths * 30 * 24 * 60 * 60 * 1000)
        : null;

    const cert = await this.prisma.client.certificate.create({
      data: {
        studentId,
        courseId,
        code,
        grade,
        finalScore,
        expiresAt,
      },
    });

    // 7. Generate PDF + upload + update `pdfUrl`. Best-effort.
    await this.generateAndStorePdf(cert.id).catch((err) => {
      this.logger.warn(`PDF gen/upload failed for ${cert.id}: ${(err as Error).message}`);
    });

    // 8. Fire-and-forget side effects
    void this.fireIssuanceSideEffects(cert.id).catch(() => undefined);

    return { issued: true, certificateId: cert.id, grade, finalScore };
  }

  /**
   * Manual issuance by admin — bypasses criteria checks. Still creates
   * PDF + fires notifications/email.
   */
  async issueManual(
    actor: Actor,
    studentId: string,
    courseId: string,
    note: string | undefined,
    meta: Meta,
  ): Promise<IssueResult> {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN+ được cấp thủ công');
    }
    // Prevent duplicate active cert (same rule as auto-issue)
    const existing = await this.prisma.client.certificate.findFirst({
      where: {
        studentId,
        courseId,
        status: { in: [CertificateStatus.ACTIVE, CertificateStatus.EXPIRED] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Học viên đã có chứng chỉ đang hiệu lực cho khoá học này');
    }

    const course = await this.prisma.client.course.findUnique({
      where: { id: courseId },
      select: { id: true, isDeleted: true },
    });
    if (!course || course.isDeleted) throw new NotFoundException('Không tìm thấy khoá học');

    const criteria = this.criteria ? await this.criteria.get(courseId) : null;
    const thresholds = criteria?.gradeThresholds ?? DEFAULT_GRADE_THRESHOLDS;

    // Best-effort score lookup — if the student has attempts we use
    // them; otherwise a manual issue records "100" as the score.
    const quizAgg = await this.prisma.client.quizAttempt.aggregate({
      where: { studentId, completedAt: { not: null }, quiz: { lesson: { chapter: { courseId } } } },
      _sum: { score: true, maxScore: true },
    });
    const avgScore =
      quizAgg._sum.maxScore && quizAgg._sum.maxScore > 0
        ? Math.round(((quizAgg._sum.score ?? 0) / quizAgg._sum.maxScore) * 100)
        : 100;
    const grade = CertificatesService.calculateGrade(avgScore, thresholds) ?? 'Đạt';

    const code = randomUUID().toUpperCase();
    const cert = await this.prisma.client.certificate.create({
      data: {
        studentId,
        courseId,
        code,
        grade,
        finalScore: avgScore,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'CERTIFICATE_MANUAL_ISSUE',
      targetType: 'Certificate',
      targetId: cert.id,
      ipAddress: meta.ip,
      newValue: { studentId, courseId, note: note ?? null, grade, finalScore: avgScore },
    });

    await this.generateAndStorePdf(cert.id).catch(() => undefined);
    void this.fireIssuanceSideEffects(cert.id).catch(() => undefined);

    return { issued: true, certificateId: cert.id, grade, finalScore: avgScore };
  }

  /**
   * GET /certificates/:id/download — return a presigned MinIO URL for
   * the PDF. Regenerates if the DB row has no `pdfUrl` (happens when
   * the first async generation failed).
   */
  async getDownloadUrl(actor: Actor, id: string): Promise<{ url: string; filename: string }> {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { id },
      include: { course: { select: { title: true } }, student: { select: { id: true } } },
    });
    if (!cert) throw new NotFoundException('Không tìm thấy chứng chỉ');

    // Authz: owning student + ADMIN+ + the course's instructor
    const isOwner = actor.id === cert.studentId;
    const isAdmin = actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN;
    if (!isOwner && !isAdmin) {
      // Check instructor ownership
      const course = await this.prisma.client.course.findUnique({
        where: { id: cert.courseId },
        select: { instructorId: true },
      });
      if (!(actor.role === Role.INSTRUCTOR && course?.instructorId === actor.id)) {
        throw new ForbiddenException('Không có quyền tải chứng chỉ này');
      }
    }

    let key = cert.pdfUrl;
    if (!key) {
      key = await this.generateAndStorePdf(cert.id);
    }
    if (!key || !this.storage) {
      throw new BadRequestException('Chưa thể tạo PDF — vui lòng thử lại');
    }

    const url = await this.storage.getPresignedUrl(key, 3600);
    const safeTitle = cert.course.title.replace(/[^a-zA-Z0-9À-ỹ ]+/g, '').slice(0, 40);
    return { url, filename: `chung-chi-${safeTitle}-${cert.code}.pdf` };
  }

  /**
   * GET /certificates/verify/:code — public lookup (no auth). Returns
   * a minimal shape suitable for the verify page + social sharing.
   * 404 when not found or code is empty.
   */
  async verifyByCode(code: string): Promise<{
    code: string;
    studentName: string;
    courseName: string;
    issuedAt: Date;
    expiresAt: Date | null;
    grade: string | null;
    finalScore: number | null;
    status: CertificateStatus;
    institutionName: string;
    revokedReason: string | null;
  }> {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        student: { select: { name: true } },
        course: { select: { title: true } },
      },
    });
    if (!cert) throw new NotFoundException('Không tìm thấy chứng chỉ với mã này');
    return {
      code: cert.code,
      studentName: cert.student.name,
      courseName: cert.course.title,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      grade: cert.grade,
      finalScore: cert.finalScore,
      status: cert.status,
      institutionName: INSTITUTION_NAME,
      revokedReason: cert.revokedReason,
    };
  }

  // =====================================================
  // Phase 16 — grade calculator (static so tests don't need DI)
  // =====================================================
  static calculateGrade(
    score: number,
    thresholds: { excellent: number; good: number; pass: number },
  ): string | null {
    if (score >= thresholds.excellent) return 'Xuất sắc';
    if (score >= thresholds.good) return 'Giỏi';
    if (score >= thresholds.pass) return 'Đạt';
    return null;
  }

  // =====================================================
  // Helpers
  // =====================================================
  private computeFinalScore(
    quizAvg: number,
    practiceAvg: number,
    quizCount: number,
    practiceCount: number,
  ): number {
    if (quizCount === 0 && practiceCount === 0) return 100; // pure theory with no quiz → assume pass
    if (quizCount === 0) return practiceAvg;
    if (practiceCount === 0) return quizAvg;
    return Math.round((quizAvg + practiceAvg) / 2);
  }

  private async generateAndStorePdf(certId: string): Promise<string | null> {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { id: certId },
      include: {
        student: { select: { name: true, email: true } },
        course: { select: { title: true, instructor: { select: { name: true } } } },
      },
    });
    if (!cert) return null;

    const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const verifyUrl = `${appBaseUrl}/verify/${cert.code}`;
    const input: CertificatePdfInput = {
      studentName: cert.student.name,
      courseName: cert.course.title,
      code: cert.code,
      grade: cert.grade ?? 'Đạt',
      finalScore: cert.finalScore ?? 0,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      verifyUrl,
      institutionName: INSTITUTION_NAME,
      signerName: cert.course.instructor?.name,
      signerTitle: 'Giảng viên',
    };

    const buffer = await renderCertificatePdf(input);
    const key = `${STORAGE_PREFIXES.CERTIFICATES}/${cert.id}.pdf`;
    if (!this.storage) return null;
    await this.storage.upload(key, buffer, buffer.length, 'application/pdf');
    await this.prisma.client.certificate.update({
      where: { id: cert.id },
      data: { pdfUrl: key },
    });
    return key;
  }

  private async fireIssuanceSideEffects(certId: string): Promise<void> {
    const cert = await this.prisma.client.certificate.findUnique({
      where: { id: certId },
      include: {
        student: { select: { id: true, name: true, email: true } },
        course: { select: { title: true } },
      },
    });
    if (!cert) return;
    const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const verifyUrl = `${appBaseUrl}/verify/${cert.code}`;

    // 1. In-app notification
    if (this.notifications) {
      await this.notifications
        .create({
          userId: cert.studentId,
          type: 'CERTIFICATE_ISSUED',
          title: 'Bạn vừa nhận chứng chỉ mới!',
          message: `Chúc mừng — bạn đã hoàn thành "${cert.course.title}" với xếp loại ${cert.grade ?? ''}.`,
          data: { certificateId: cert.id, courseTitle: cert.course.title, code: cert.code },
        })
        .catch(() => undefined);
    }

    // 2. Email — reuses the Phase 09 `certificate` template
    if (this.email) {
      await this.email
        .enqueue({
          to: cert.student.email,
          template: 'certificate',
          props: {
            name: cert.student.name,
            courseName: cert.course.title,
            certificateUrl: verifyUrl,
            issuedAt: cert.issuedAt.toLocaleDateString('vi-VN'),
          },
        })
        .catch(() => undefined);
    }

    // 3. Audit
    await this.audit
      .log({
        userId: cert.studentId,
        action: 'CERTIFICATE_ISSUED',
        targetType: 'Certificate',
        targetId: cert.id,
        ipAddress: 'system',
        newValue: {
          code: cert.code,
          grade: cert.grade,
          finalScore: cert.finalScore,
          courseId: cert.courseId,
        },
      })
      .catch(() => undefined);
  }
}
