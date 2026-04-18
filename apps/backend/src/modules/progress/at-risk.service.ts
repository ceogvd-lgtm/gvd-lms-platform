import { Role } from '@lms/database';
import { ForbiddenException, Injectable } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { NotificationsService } from '../notifications/notifications.service';

interface Actor {
  id: string;
  role: Role;
}

// =====================================================
// Thresholds — Phase 15 spec
// =====================================================
// Kept as exported constants so tests + API callers can reference the
// same numbers instead of copy-pasting magic values.
export const AT_RISK = {
  PROGRESS_BELOW: 30,
  PROGRESS_GRACE_DAYS: 7,
  INACTIVE_DAYS: 5,
  AVG_SCORE_BELOW: 50,
  MIN_ATTEMPTS_FOR_SCORE: 3,
} as const;

export type AtRiskReasonCode = 'SLOW_START' | 'INACTIVE' | 'LOW_SCORE' | 'SAFETY_VIOLATION';

export interface AtRiskStudent {
  studentId: string;
  studentName: string;
  studentEmail: string;
  avatar: string | null;
  courseId: string;
  courseTitle: string;
  progressPercent: number;
  lastActiveAt: Date;
  avgScore: number | null;
  reasons: AtRiskReasonCode[];
  /** Human-readable Vietnamese explanation per reason. */
  reasonMessages: string[];
}

/**
 * Phase 15 — At-risk detection + side-effects.
 *
 * Extends Phase 10's simple "progress<30% AND inactive>7d" rule with
 * four independent conditions. A student is flagged if ANY condition
 * fires; reasons are listed individually so the UI can explain
 * exactly why without the instructor having to guess.
 *
 * Side-effects (notification + email + audit) are intentionally
 * decoupled from `detectAtRisk()` — the core detection is a pure
 * function of DB state (used by tests and REST reads), while
 * `runScheduledSweep()` is the imperative wrapper that fires
 * notifications once per discovery.
 */
@Injectable()
export class AtRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // Core detection — pure read
  // =====================================================

  /**
   * Scope:
   *   - ADMIN+ → every enrollment
   *   - INSTRUCTOR → only their own courses
   *   - STUDENT → 403 (callers should never hit this with STUDENT)
   *
   * `courseId` filter (optional) narrows to a single course.
   */
  async detectAtRisk(actor: Actor, courseId?: string): Promise<AtRiskStudent[]> {
    if (actor.role === Role.STUDENT) {
      throw new ForbiddenException('Không có quyền');
    }

    const courseFilter: Record<string, unknown> = { isDeleted: false };
    if (courseId) courseFilter.id = courseId;
    if (actor.role === Role.INSTRUCTOR) courseFilter.instructorId = actor.id;

    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: {
        completedAt: null, // finished students aren't at risk
        course: courseFilter,
      },
      include: {
        student: { select: { id: true, name: true, email: true, avatar: true } },
        course: { select: { id: true, title: true } },
      },
    });

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const flagged: AtRiskStudent[] = [];

    for (const e of enrollments) {
      const reasons: AtRiskReasonCode[] = [];
      const msgs: string[] = [];

      // 1. Slow start — progress<30% after >=7d enrolled
      const daysSinceEnrolled = (now - e.enrolledAt.getTime()) / DAY;
      if (
        daysSinceEnrolled >= AT_RISK.PROGRESS_GRACE_DAYS &&
        e.progressPercent < AT_RISK.PROGRESS_BELOW
      ) {
        reasons.push('SLOW_START');
        msgs.push(
          `Chỉ hoàn thành ${e.progressPercent}% sau ${Math.floor(daysSinceEnrolled)} ngày enrolled`,
        );
      }

      // 2. Inactive — lastActiveAt older than 5d
      const daysInactive = (now - e.lastActiveAt.getTime()) / DAY;
      if (daysInactive > AT_RISK.INACTIVE_DAYS) {
        reasons.push('INACTIVE');
        msgs.push(`Không hoạt động ${Math.floor(daysInactive)} ngày`);
      }

      // 3. Low score — avg<50% across >=3 attempts
      const attempts = await this.prisma.client.quizAttempt.findMany({
        where: {
          studentId: e.studentId,
          completedAt: { not: null },
          quiz: { lesson: { chapter: { courseId: e.courseId } } },
        },
        select: { score: true, maxScore: true },
      });
      if (attempts.length >= AT_RISK.MIN_ATTEMPTS_FOR_SCORE) {
        const total = attempts.reduce((s, a) => s + a.score, 0);
        const max = attempts.reduce((s, a) => s + a.maxScore, 0);
        const avg = max > 0 ? Math.round((total / max) * 100) : 0;
        if (avg < AT_RISK.AVG_SCORE_BELOW) {
          reasons.push('LOW_SCORE');
          msgs.push(`Điểm TB ${avg}% sau ${attempts.length} bài kiểm tra`);
        }
      }

      // 4. Critical safety violation in practice
      const violation = await this.prisma.client.practiceAttempt.findFirst({
        where: {
          studentId: e.studentId,
          hasCriticalViolation: true,
          practiceContent: { lesson: { chapter: { courseId: e.courseId } } },
        },
        select: { id: true },
      });
      if (violation) {
        reasons.push('SAFETY_VIOLATION');
        msgs.push('Đã có vi phạm an toàn nghiêm trọng khi thực hành');
      }

      if (reasons.length > 0) {
        // avg score for reporting (independent of the LOW_SCORE flag)
        const aggAll = await this.prisma.client.lessonProgress.aggregate({
          where: {
            studentId: e.studentId,
            score: { not: null },
            lesson: { chapter: { courseId: e.courseId } },
          },
          _avg: { score: true },
        });
        const avgScoreAll = aggAll._avg.score !== null ? Math.round(aggAll._avg.score) : null;

        flagged.push({
          studentId: e.student.id,
          studentName: e.student.name,
          studentEmail: e.student.email,
          avatar: e.student.avatar,
          courseId: e.course.id,
          courseTitle: e.course.title,
          progressPercent: e.progressPercent,
          lastActiveAt: e.lastActiveAt,
          avgScore: avgScoreAll,
          reasons,
          reasonMessages: msgs,
        });
      }
    }

    return flagged;
  }

  // =====================================================
  // Scheduled sweep — called by BullMQ daily at 08:00
  // =====================================================
  /**
   * Runs the detection across the whole system as a system-level
   * actor (synthetic ADMIN privileges). For every flagged student:
   *   - fires a NOTIFICATION to the course's instructor
   *   - enqueues an EMAIL to the student (uses existing
   *     EmailService.sendAtRiskAlert wrapper from Phase 10)
   *   - writes an AUDIT log entry
   *
   * We dedupe within a single sweep (one alert per student×course per
   * day) via an in-memory Set; cross-day dedup is the responsibility
   * of the caller (they shouldn't schedule the sweep more than once
   * per 24 h).
   */
  async runScheduledSweep(): Promise<{ flagged: number; notificationsSent: number }> {
    const systemActor: Actor = {
      id: 'system',
      role: Role.SUPER_ADMIN,
    };
    const flagged = await this.detectAtRisk(systemActor);

    let notificationsSent = 0;
    const seen = new Set<string>();

    for (const f of flagged) {
      const key = `${f.studentId}:${f.courseId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Look up course instructor (we cleared that info through detectAtRisk
      // but didn't surface it on the row).
      const course = await this.prisma.client.course.findUnique({
        where: { id: f.courseId },
        select: { instructorId: true, title: true },
      });
      if (!course) continue;

      // 1. notify instructor
      await this.notifications
        .create({
          userId: course.instructorId,
          type: 'SYSTEM_ALERT',
          title: 'Học viên có nguy cơ bỏ học',
          message: `${f.studentName} — ${f.reasonMessages.join('; ')}`,
          data: {
            studentId: f.studentId,
            courseId: f.courseId,
            reasons: f.reasons,
          },
        })
        .catch(() => undefined);

      // 2. reminder email to student — reuse EmailService.sendAtRiskAlert
      //    (template ships with the existing discriminated union —
      //    Phase 15 MUST NOT invent a new template here).
      const daysInactive = Math.max(
        1,
        Math.floor((Date.now() - f.lastActiveAt.getTime()) / (24 * 60 * 60 * 1000)),
      );
      await this.email
        .sendAtRiskAlert(f.studentEmail, {
          name: f.studentName,
          daysInactive,
          currentProgress: f.progressPercent,
          resumeUrl: `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/student/my-learning`,
        })
        .catch(() => undefined);

      // 3. audit
      await this.audit
        .log({
          userId: course.instructorId,
          action: 'AT_RISK_DETECTED',
          targetType: 'CourseEnrollment',
          targetId: `${f.courseId}:${f.studentId}`,
          ipAddress: 'system',
          newValue: { reasons: f.reasons, progressPercent: f.progressPercent },
        })
        .catch(() => undefined);

      notificationsSent += 1;
    }

    return { flagged: flagged.length, notificationsSent };
  }
}
