import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  buildCertificateListXlsx,
  buildProgressReportXlsx,
  buildUserListXlsx,
} from './exporters/excel.exporter';
import {
  buildCertificateListDoc,
  buildProgressReportDoc,
  buildUserListDoc,
  renderPdf,
} from './exporters/pdf.exporter';

export type ExportFormat = 'pdf' | 'xlsx';

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface ProgressFilter {
  departmentId?: string;
  subjectId?: string;
  courseId?: string;
  from?: string;
  to?: string;
}

export interface UserFilter {
  role?: string;
  status?: 'active' | 'blocked';
}

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

/**
 * Reports service (Phase 09).
 *
 * Runs aggregation queries then delegates to the Excel or PDF exporter.
 * Designed to be cheap — every export is bounded (LIMIT 1000 rows) so
 * reports never blow up under large datasets; the UI tells the user
 * to narrow filters if they hit the cap.
 */
@Injectable()
export class ReportsService {
  private static readonly MAX_ROWS = 1000;

  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // Progress report — JSON preview
  // =====================================================
  async getProgressReport(filter: ProgressFilter) {
    const rows = await this.queryProgressRows(filter);
    return {
      filter,
      total: rows.length,
      rows,
      truncated: rows.length >= ReportsService.MAX_ROWS,
    };
  }

  private async queryProgressRows(filter: ProgressFilter) {
    const where: Record<string, unknown> = {
      student: { role: 'STUDENT' },
    };

    // Scope enrollments by course filters
    const courseWhere: Record<string, unknown> = { isDeleted: false };
    if (filter.courseId) courseWhere.id = filter.courseId;
    if (filter.subjectId) courseWhere.subjectId = filter.subjectId;
    if (filter.departmentId) {
      courseWhere.subject = { departmentId: filter.departmentId };
    }
    where.course = courseWhere;

    if (filter.from || filter.to) {
      const dateFilter: Record<string, unknown> = {};
      if (filter.from) dateFilter.gte = new Date(filter.from);
      if (filter.to) dateFilter.lte = new Date(filter.to);
      where.enrolledAt = dateFilter;
    }

    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where,
      orderBy: { enrolledAt: 'desc' },
      take: ReportsService.MAX_ROWS,
      include: {
        student: { select: { name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    });

    // Compute progress per enrollment by counting completed lesson progress
    // across all lessons in the course. For a Phase 09 report this is
    // acceptable latency; if it gets slow we denormalise later.
    const rows = await Promise.all(
      enrollments.map(async (e) => {
        const [totalLessons, completedLessons, quizScore] = await Promise.all([
          this.prisma.client.lesson.count({
            where: { chapter: { courseId: e.courseId }, isDeleted: false },
          }),
          this.prisma.client.lessonProgress.count({
            where: {
              studentId: e.studentId,
              status: 'COMPLETED',
              lesson: {
                chapter: { courseId: e.courseId },
                isDeleted: false,
              },
            },
          }),
          this.prisma.client.quizAttempt.findFirst({
            where: {
              studentId: e.studentId,
              quiz: { lesson: { chapter: { courseId: e.courseId } } },
              completedAt: { not: null },
            },
            orderBy: { score: 'desc' },
            select: { score: true, maxScore: true },
          }),
        ]);

        const progressPercent =
          totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
        const score =
          quizScore && quizScore.maxScore > 0
            ? Math.round((quizScore.score / quizScore.maxScore) * 100)
            : null;

        return {
          studentName: e.student.name,
          studentEmail: e.student.email,
          courseTitle: e.course.title,
          progressPercent,
          completedAt: e.completedAt,
          score,
        };
      }),
    );

    return rows;
  }

  // =====================================================
  // Progress report — export PDF/XLSX
  // =====================================================
  async exportProgressReport(format: ExportFormat, filter: ProgressFilter): Promise<ExportResult> {
    const rows = await this.queryProgressRows(filter);
    const title = 'Báo cáo tiến độ học tập';
    const subtitle = buildSubtitle(filter);
    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'pdf') {
      const doc = buildProgressReportDoc(rows, title, subtitle);
      const buffer = await renderPdf(doc);
      return {
        buffer,
        contentType: CONTENT_TYPES.pdf,
        filename: `progress-${timestamp}.pdf`,
      };
    }

    const buffer = await buildProgressReportXlsx(rows, title, subtitle);
    return {
      buffer,
      contentType: CONTENT_TYPES.xlsx,
      filename: `progress-${timestamp}.xlsx`,
    };
  }

  // =====================================================
  // Users export — PDF/XLSX
  // =====================================================
  async exportUsers(format: ExportFormat, filter: UserFilter): Promise<ExportResult> {
    const where: Record<string, unknown> = {};
    if (filter.role) where.role = filter.role;
    if (filter.status === 'active') where.isBlocked = false;
    if (filter.status === 'blocked') where.isBlocked = true;

    const users = await this.prisma.client.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: ReportsService.MAX_ROWS,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isBlocked: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    const title = 'Danh sách người dùng';
    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'pdf') {
      const doc = buildUserListDoc(users, title);
      const buffer = await renderPdf(doc);
      return { buffer, contentType: CONTENT_TYPES.pdf, filename: `users-${timestamp}.pdf` };
    }

    const buffer = await buildUserListXlsx(users, title);
    return { buffer, contentType: CONTENT_TYPES.xlsx, filename: `users-${timestamp}.xlsx` };
  }

  // =====================================================
  // Certificates export — PDF/XLSX
  // =====================================================
  async exportCertificates(format: ExportFormat): Promise<ExportResult> {
    const certs = await this.prisma.client.certificate.findMany({
      orderBy: { issuedAt: 'desc' },
      take: ReportsService.MAX_ROWS,
      include: {
        student: { select: { name: true, email: true } },
        course: { select: { title: true } },
      },
    });

    const rows = certs.map((c) => ({
      code: c.code,
      studentName: c.student.name,
      studentEmail: c.student.email,
      courseTitle: c.course.title,
      issuedAt: c.issuedAt,
      status: c.status,
      revokedReason: c.revokedReason ?? null,
    }));

    const title = 'Danh sách chứng chỉ';
    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'pdf') {
      const pdfRows = rows.map((r) => ({
        code: r.code,
        studentName: r.studentName,
        courseTitle: r.courseTitle,
        issuedAt: r.issuedAt,
        status: r.status,
      }));
      const doc = buildCertificateListDoc(pdfRows, title);
      const buffer = await renderPdf(doc);
      return {
        buffer,
        contentType: CONTENT_TYPES.pdf,
        filename: `certificates-${timestamp}.pdf`,
      };
    }

    const buffer = await buildCertificateListXlsx(rows, title);
    return {
      buffer,
      contentType: CONTENT_TYPES.xlsx,
      filename: `certificates-${timestamp}.xlsx`,
    };
  }
}

function buildSubtitle(f: ProgressFilter): string {
  const parts: string[] = [];
  if (f.from) parts.push(`Từ ${new Date(f.from).toLocaleDateString('vi-VN')}`);
  if (f.to) parts.push(`Đến ${new Date(f.to).toLocaleDateString('vi-VN')}`);
  if (f.departmentId) parts.push(`Ngành: ${f.departmentId}`);
  if (f.subjectId) parts.push(`Môn: ${f.subjectId}`);
  if (f.courseId) parts.push(`Khoá: ${f.courseId}`);
  return parts.length > 0 ? parts.join(' · ') : 'Toàn bộ';
}
