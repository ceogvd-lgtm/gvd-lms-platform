import { Role } from '@lms/database';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { UpsertCriteriaDto } from './dto/upsert-criteria.dto';

interface Actor {
  id: string;
  role: Role;
}

export interface CertificateCriteriaDto {
  id: string | null;
  courseId: string;
  minPassScore: number;
  minProgress: number;
  minPracticeScore: number;
  noSafetyViolation: boolean;
  requiredLessons: string[];
  validityMonths: number | null;
  gradeThresholds: { excellent: number; good: number; pass: number };
  customCriteria: unknown;
  // true when the row actually exists; false means we returned defaults
  exists: boolean;
}

export const DEFAULT_GRADE_THRESHOLDS = {
  excellent: 90,
  good: 80,
  pass: 70,
} as const;

/**
 * Phase 16 — manage per-course certificate criteria.
 *
 * The row is optional: if an instructor hasn't saved criteria for a
 * course, reads return sensible defaults so `CertificatesService`
 * always has something to compare against at issuance time.
 */
@Injectable()
export class CertificateCriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /certificates/criteria/:courseId
   *
   * Falls back to default thresholds if no row exists. Any authenticated
   * user can read so students can see what they need to hit.
   */
  async get(courseId: string): Promise<CertificateCriteriaDto> {
    const row = await this.prisma.client.certificateCriteria.findUnique({
      where: { courseId },
    });
    if (!row) {
      return {
        id: null,
        courseId,
        minPassScore: 70,
        minProgress: 100,
        minPracticeScore: 0,
        noSafetyViolation: true,
        requiredLessons: [],
        validityMonths: null,
        gradeThresholds: { ...DEFAULT_GRADE_THRESHOLDS },
        customCriteria: null,
        exists: false,
      };
    }
    return {
      id: row.id,
      courseId: row.courseId,
      minPassScore: row.minPassScore,
      minProgress: row.minProgress,
      minPracticeScore: row.minPracticeScore,
      noSafetyViolation: row.noSafetyViolation,
      requiredLessons: row.requiredLessons,
      validityMonths: row.validityMonths,
      gradeThresholds: this.normalizeThresholds(row.gradeThresholds),
      customCriteria: row.customCriteria,
      exists: true,
    };
  }

  /**
   * PUT /certificates/criteria/:courseId
   *
   * Instructor must own the course (via Course.instructorId); ADMIN+
   * bypasses. Upsert semantics: create on first save, update thereafter.
   */
  async upsert(
    actor: Actor,
    courseId: string,
    dto: UpsertCriteriaDto,
  ): Promise<CertificateCriteriaDto> {
    await this.assertCourseOwnership(actor, courseId);

    const gradeThresholds = dto.gradeThresholds ?? { ...DEFAULT_GRADE_THRESHOLDS };

    const row = await this.prisma.client.certificateCriteria.upsert({
      where: { courseId },
      create: {
        courseId,
        minPassScore: dto.minPassScore ?? 70,
        minProgress: dto.minProgress ?? 100,
        minPracticeScore: dto.minPracticeScore ?? 0,
        noSafetyViolation: dto.noSafetyViolation ?? true,
        requiredLessons: dto.requiredLessons ?? [],
        validityMonths: dto.validityMonths ?? null,
        gradeThresholds: gradeThresholds as never,
        customCriteria: (dto.customCriteria ?? null) as never,
      },
      update: {
        minPassScore: dto.minPassScore,
        minProgress: dto.minProgress,
        minPracticeScore: dto.minPracticeScore,
        noSafetyViolation: dto.noSafetyViolation,
        requiredLessons: dto.requiredLessons,
        validityMonths: dto.validityMonths,
        gradeThresholds: gradeThresholds as never,
        customCriteria: (dto.customCriteria ?? null) as never,
      },
    });

    return {
      id: row.id,
      courseId: row.courseId,
      minPassScore: row.minPassScore,
      minProgress: row.minProgress,
      minPracticeScore: row.minPracticeScore,
      noSafetyViolation: row.noSafetyViolation,
      requiredLessons: row.requiredLessons,
      validityMonths: row.validityMonths,
      gradeThresholds: this.normalizeThresholds(row.gradeThresholds),
      customCriteria: row.customCriteria,
      exists: true,
    };
  }

  /**
   * DELETE /certificates/criteria/:courseId — revert to defaults
   */
  async remove(actor: Actor, courseId: string): Promise<{ message: string }> {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên được xoá tiêu chí');
    }
    const existing = await this.prisma.client.certificateCriteria.findUnique({
      where: { courseId },
    });
    if (!existing) throw new NotFoundException('Chưa có tiêu chí để xoá');
    await this.prisma.client.certificateCriteria.delete({ where: { courseId } });
    return { message: 'Đã xoá tiêu chí — khoá học trở về mặc định' };
  }

  // =====================================================
  // Helpers
  // =====================================================
  private normalizeThresholds(raw: unknown): { excellent: number; good: number; pass: number } {
    const obj = (raw ?? {}) as Record<string, unknown>;
    return {
      excellent:
        typeof obj.excellent === 'number' ? obj.excellent : DEFAULT_GRADE_THRESHOLDS.excellent,
      good: typeof obj.good === 'number' ? obj.good : DEFAULT_GRADE_THRESHOLDS.good,
      pass: typeof obj.pass === 'number' ? obj.pass : DEFAULT_GRADE_THRESHOLDS.pass,
    };
  }

  private async assertCourseOwnership(actor: Actor, courseId: string): Promise<void> {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role !== Role.INSTRUCTOR) {
      throw new ForbiddenException('Không có quyền');
    }
    const course = await this.prisma.client.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true, isDeleted: true },
    });
    if (!course || course.isDeleted) throw new NotFoundException('Không tìm thấy khoá học');
    if (course.instructorId !== actor.id) {
      throw new ForbiddenException('Bạn không phải là giảng viên của khoá học này');
    }
  }
}
