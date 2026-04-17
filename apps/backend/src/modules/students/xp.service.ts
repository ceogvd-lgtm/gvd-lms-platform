import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Gamification XP awards (Phase 14, intentionally simple scope).
 *
 * Reasons per CONTEXT.md:
 *   LESSON_COMPLETED  +10
 *   QUIZ_PASSED       +20
 *   COURSE_COMPLETED +100
 *
 * Level = floor(totalXP / 100) + 1 — no bespoke curve, we tune later.
 * Re-awards for the same reason are the caller's responsibility (e.g.
 * QuizAttempts awards only on FIRST pass).
 */
export enum XpReason {
  LESSON_COMPLETED = 'LESSON_COMPLETED',
  QUIZ_PASSED = 'QUIZ_PASSED',
  COURSE_COMPLETED = 'COURSE_COMPLETED',
}

export const XP_VALUES: Record<XpReason, number> = {
  [XpReason.LESSON_COMPLETED]: 10,
  [XpReason.QUIZ_PASSED]: 20,
  [XpReason.COURSE_COMPLETED]: 100,
};

function computeLevel(totalXP: number): number {
  return Math.floor(totalXP / 100) + 1;
}

@Injectable()
export class XpService {
  private readonly logger = new Logger(XpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Award XP to a student + recompute level. Creates the StudentXP row
   * on first award. Returns the new totals so callers can surface them
   * in the response (e.g. the quiz-result screen's "+20 XP" popup).
   */
  async award(
    studentId: string,
    reason: XpReason,
    customAmount?: number,
  ): Promise<{ totalXP: number; level: number; delta: number }> {
    const delta = customAmount ?? XP_VALUES[reason];

    const existing = await this.prisma.client.studentXP.findUnique({
      where: { studentId },
    });

    if (!existing) {
      const row = await this.prisma.client.studentXP.create({
        data: { studentId, totalXP: delta, level: computeLevel(delta) },
      });
      this.logger.log(`XP +${delta} (${reason}) → student=${studentId} total=${row.totalXP}`);
      return { totalXP: row.totalXP, level: row.level, delta };
    }

    const totalXP = existing.totalXP + delta;
    const row = await this.prisma.client.studentXP.update({
      where: { studentId },
      data: { totalXP, level: computeLevel(totalXP) },
    });
    this.logger.log(`XP +${delta} (${reason}) → student=${studentId} total=${row.totalXP}`);
    return { totalXP: row.totalXP, level: row.level, delta };
  }

  async getForStudent(studentId: string): Promise<{ totalXP: number; level: number }> {
    const row = await this.prisma.client.studentXP.findUnique({ where: { studentId } });
    if (!row) return { totalXP: 0, level: 1 };
    return { totalXP: row.totalXP, level: row.level };
  }
}
