import type { Prisma } from '@lms/database';
import { ProgressStatus, Role } from '@lms/database';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { CompleteAttemptDto, RecordActionDto, StartAttemptDto } from './dto/practice.dto';
import {
  calculateFinalScore,
  type SafetyViolation,
  type ScoringConfig,
  type ScoringResult,
  type StepResult,
} from './scoring-engine';

interface Actor {
  id: string;
  role: Role;
}

export interface StartAttemptResult {
  attemptId: string;
  scoringConfig: ScoringConfig;
  safetyChecklist: ScoringConfig['safetyChecklist'];
  timeLimit: number | null;
  maxAttempts: number | null;
  attemptsUsed: number;
}

export interface CompleteAttemptResult {
  passed: boolean;
  score: number;
  maxScore: number;
  penalty: number;
  criticalViolations: string[];
  stepBreakdown: ScoringResult['stepBreakdown'];
  feedback: string;
}

export interface AttemptRow {
  id: string;
  practiceContentId: string;
  studentId: string;
  score: number;
  maxScore: number;
  duration: number;
  status: ProgressStatus;
  completedAt: Date | null;
  createdAt: Date;
  actions: unknown;
  violations: unknown;
  student?: { id: string; name: string; email: string } | null;
}

export interface AttemptAnalytics {
  totalAttempts: number;
  studentsAttempted: number;
  avgScore: number;
  passRate: number;
  avgDuration: number;
  stepAnalytics: Array<{
    stepId: string;
    description: string;
    attempts: number;
    correct: number;
    correctPercent: number;
  }>;
  safetyViolationStats: Array<{
    safetyId: string;
    description: string;
    isCritical: boolean;
    violationCount: number;
    violationPercent: number;
  }>;
  ranking: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    bestScore: number;
    bestMaxScore: number;
    passed: boolean;
    attemptCount: number;
  }>;
}

/**
 * Orchestration for the virtual-lab lifecycle.
 *
 * Each student `attempt` is a row in the existing `PracticeAttempt`
 * table (Phase 02). The lifecycle is:
 *
 *   1. `start()` — server allocates a fresh row in IN_PROGRESS, returns
 *      the scoring config + safety checklist so the Unity build can be
 *      bootstrapped via the LMS Bridge.
 *   2. `action()` — every meaningful Unity event is POSTed here; we
 *      append to `PracticeAttempt.actions` (Json) so the instructor
 *      can replay the attempt for grading disputes.
 *   3. `complete()` — Unity's LMS_COMPLETE event; we run the pure
 *      scoring engine, persist the final score + violations, and
 *      cascade to LessonProgress = COMPLETED when the student passes.
 */
@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // Helpers
  // =====================================================

  /** Load a PracticeContent row joined to the owning course. */
  private async loadPracticeContent(lessonId: string) {
    const pc = await this.prisma.client.practiceContent.findUnique({
      where: { lessonId },
      include: {
        lesson: {
          include: {
            chapter: {
              include: { course: { select: { id: true, instructorId: true } } },
            },
          },
        },
      },
    });
    if (!pc || pc.lesson.isDeleted) {
      throw new NotFoundException('Bài giảng này chưa có nội dung thực hành');
    }
    return pc;
  }

  /** ADMIN+ or owning instructor can view analytics for the course. */
  private assertInstructorView(actor: Actor, courseInstructorId: string): void {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === courseInstructorId) return;
    throw new ForbiddenException('Bạn không có quyền xem phân tích của khoá này');
  }

  private parseScoringConfig(raw: unknown): ScoringConfig {
    const obj = (raw ?? {}) as {
      steps?: ScoringConfig['steps'];
      safetyChecklist?: ScoringConfig['safetyChecklist'];
      passScore?: number;
      timeLimit?: number | null;
    };
    return {
      steps: Array.isArray(obj.steps) ? obj.steps : [],
      safetyChecklist: Array.isArray(obj.safetyChecklist) ? obj.safetyChecklist : [],
      passScore: typeof obj.passScore === 'number' ? obj.passScore : 70,
      timeLimit: typeof obj.timeLimit === 'number' ? obj.timeLimit : null,
    };
  }

  // =====================================================
  // POST /practice/start
  // =====================================================
  async startAttempt(actor: Actor, dto: StartAttemptDto): Promise<StartAttemptResult> {
    const pc = await this.loadPracticeContent(dto.lessonId);

    const attemptsUsed = await this.prisma.client.practiceAttempt.count({
      where: { practiceContentId: pc.id, studentId: actor.id },
    });

    if (pc.maxAttempts != null && attemptsUsed >= pc.maxAttempts) {
      throw new ForbiddenException('Đã hết số lần thử cho bài thực hành này');
    }

    const merged = this.parseScoringConfig(pc.scoringConfig);
    const safetyFromColumn = extractSafetyItems(pc.safetyChecklist);
    if (merged.safetyChecklist.length === 0 && safetyFromColumn.length > 0) {
      merged.safetyChecklist = safetyFromColumn;
    }
    merged.passScore = pc.passScore;
    merged.timeLimit = pc.timeLimit ?? null;

    const row = await this.prisma.client.practiceAttempt.create({
      data: {
        practiceContentId: pc.id,
        studentId: actor.id,
        score: 0,
        maxScore: merged.steps.reduce((sum, s) => sum + s.maxPoints, 0),
        actions: [] as unknown as Prisma.InputJsonValue,
        violations: [] as unknown as Prisma.InputJsonValue,
        duration: 0,
        status: ProgressStatus.IN_PROGRESS,
      },
    });

    await this.prisma.client.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId: dto.lessonId, studentId: actor.id } },
      update: { status: ProgressStatus.IN_PROGRESS, lastViewAt: new Date() },
      create: {
        lessonId: dto.lessonId,
        studentId: actor.id,
        status: ProgressStatus.IN_PROGRESS,
        lastViewAt: new Date(),
      },
    });

    return {
      attemptId: row.id,
      scoringConfig: merged,
      safetyChecklist: merged.safetyChecklist,
      timeLimit: merged.timeLimit,
      maxAttempts: pc.maxAttempts,
      attemptsUsed: attemptsUsed + 1,
    };
  }

  // =====================================================
  // POST /practice/action
  // =====================================================
  async recordAction(actor: Actor, dto: RecordActionDto): Promise<{ ok: true }> {
    const attempt = await this.prisma.client.practiceAttempt.findUnique({
      where: { id: dto.attemptId },
      select: { id: true, studentId: true, status: true, actions: true },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy phiên thực hành');
    if (attempt.studentId !== actor.id) {
      throw new ForbiddenException('Không thể ghi action cho phiên của người khác');
    }
    if (attempt.status === ProgressStatus.COMPLETED) {
      throw new BadRequestException('Phiên đã hoàn thành, không thể ghi thêm action');
    }

    const existing = Array.isArray(attempt.actions) ? (attempt.actions as unknown[]) : [];
    const next = [
      ...existing,
      {
        stepId: dto.stepId,
        isCorrect: dto.isCorrect,
        isInOrder: dto.isInOrder ?? null,
        isSafe: dto.isSafe ?? null,
        safetyViolationId: dto.safetyViolationId ?? null,
        score: dto.score ?? null,
        timestamp: dto.timestamp ?? Date.now(),
      },
    ];

    await this.prisma.client.practiceAttempt.update({
      where: { id: dto.attemptId },
      data: { actions: next as unknown as Prisma.InputJsonValue },
    });
    return { ok: true };
  }

  // =====================================================
  // POST /practice/complete
  // =====================================================
  async completeAttempt(actor: Actor, dto: CompleteAttemptDto): Promise<CompleteAttemptResult> {
    const attempt = await this.prisma.client.practiceAttempt.findUnique({
      where: { id: dto.attemptId },
      include: {
        practiceContent: {
          include: {
            lesson: { select: { id: true, isDeleted: true } },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy phiên thực hành');
    if (attempt.studentId !== actor.id) {
      throw new ForbiddenException('Không thể hoàn tất phiên của người khác');
    }
    if (attempt.status === ProgressStatus.COMPLETED) {
      throw new BadRequestException('Phiên đã hoàn thành');
    }

    const scoringConfig = this.parseScoringConfig(attempt.practiceContent.scoringConfig);
    if (scoringConfig.safetyChecklist.length === 0) {
      scoringConfig.safetyChecklist = extractSafetyItems(attempt.practiceContent.safetyChecklist);
    }
    scoringConfig.passScore = attempt.practiceContent.passScore;

    const stepsResult: StepResult[] = dto.stepsResult.map((s) => ({
      stepId: s.stepId,
      isCorrect: s.isCorrect,
      isInOrder: s.isInOrder,
    }));
    const violations: SafetyViolation[] = dto.safetyViolations.map((v) => ({
      safetyId: v.safetyId,
      timestamp: v.timestamp,
    }));

    const score = calculateFinalScore(stepsResult, violations, scoringConfig);

    const now = new Date();
    await this.prisma.client.practiceAttempt.update({
      where: { id: dto.attemptId },
      data: {
        score: Math.round(score.finalScore),
        maxScore: Math.max(1, score.maxScore),
        duration: dto.duration,
        violations: violations as unknown as Prisma.InputJsonValue,
        status: ProgressStatus.COMPLETED,
        completedAt: now,
      },
    });

    if (score.passed && attempt.practiceContent.lesson) {
      await this.prisma.client.lessonProgress.upsert({
        where: {
          lessonId_studentId: {
            lessonId: attempt.practiceContent.lesson.id,
            studentId: actor.id,
          },
        },
        update: {
          status: ProgressStatus.COMPLETED,
          score: Math.round(score.finalScore),
          completedAt: now,
          lastViewAt: now,
        },
        create: {
          lessonId: attempt.practiceContent.lesson.id,
          studentId: actor.id,
          status: ProgressStatus.COMPLETED,
          score: Math.round(score.finalScore),
          completedAt: now,
          lastViewAt: now,
        },
      });
    }

    const pct = Math.round((score.finalScore / Math.max(1, score.maxScore)) * 100);
    const feedback = score.passed
      ? `Chúc mừng! Bạn đã đạt ${pct}% và qua bài thực hành.`
      : `Chưa đạt — bạn cần ${scoringConfig.passScore}% nhưng chỉ được ${pct}%.`;

    return {
      passed: score.passed,
      score: score.finalScore,
      maxScore: score.maxScore,
      penalty: score.penalty,
      criticalViolations: score.criticalViolations,
      stepBreakdown: score.stepBreakdown,
      feedback,
    };
  }

  // =====================================================
  // GET /practice/:lessonId/attempts
  // =====================================================
  /**
   * GET /practice/:lessonId/my-attempts
   *
   * Returns **only** the caller's own attempts, regardless of their role.
   * Used by the student lesson page — the earlier `listAttempts` widened
   * to return every student's rows when an admin viewed the page, which
   * broke the "attempts used vs maxAttempts" counter for admins browsing
   * as students.
   */
  async listMyAttempts(userId: string, lessonId: string): Promise<AttemptRow[]> {
    const pc = await this.loadPracticeContent(lessonId);

    const rows = await this.prisma.client.practiceAttempt.findMany({
      where: { practiceContentId: pc.id, studentId: userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      practiceContentId: r.practiceContentId,
      studentId: r.studentId,
      score: r.score,
      maxScore: r.maxScore,
      duration: r.duration,
      status: r.status,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
      actions: r.actions,
      violations: r.violations,
      student: null,
    }));
  }

  /**
   * GET /practice/:lessonId/attempts?studentId=x
   *
   * INSTRUCTOR+ only. Returns all attempts across students by default;
   * `filterStudentId` narrows to a single student (used by the analytics
   * drill-down). An INSTRUCTOR must own the course; ADMIN+ are unrestricted.
   */
  async listAttempts(
    actor: Actor,
    lessonId: string,
    filterStudentId?: string,
  ): Promise<AttemptRow[]> {
    const pc = await this.loadPracticeContent(lessonId);

    const isOwnerOrAdmin =
      actor.role === Role.ADMIN ||
      actor.role === Role.SUPER_ADMIN ||
      (actor.role === Role.INSTRUCTOR && actor.id === pc.lesson.chapter.course.instructorId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenException('Chỉ giảng viên sở hữu khoá hoặc ADMIN+ được xem attempts');
    }

    const where: Prisma.PracticeAttemptWhereInput = { practiceContentId: pc.id };
    if (filterStudentId) where.studentId = filterStudentId;

    const rows = await this.prisma.client.practiceAttempt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { student: { select: { id: true, name: true, email: true } } },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      practiceContentId: r.practiceContentId,
      studentId: r.studentId,
      score: r.score,
      maxScore: r.maxScore,
      duration: r.duration,
      status: r.status,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
      actions: r.actions,
      violations: r.violations,
      student: (r as { student?: { id: string; name: string; email: string } }).student ?? null,
    }));
  }

  // =====================================================
  // GET /practice/:lessonId/analytics
  // =====================================================
  async getAnalytics(actor: Actor, lessonId: string): Promise<AttemptAnalytics> {
    const pc = await this.loadPracticeContent(lessonId);
    this.assertInstructorView(actor, pc.lesson.chapter.course.instructorId);

    const config = this.parseScoringConfig(pc.scoringConfig);
    if (config.safetyChecklist.length === 0) {
      config.safetyChecklist = extractSafetyItems(pc.safetyChecklist);
    }

    const attempts = await this.prisma.client.practiceAttempt.findMany({
      where: { practiceContentId: pc.id },
      include: { student: { select: { id: true, name: true, email: true } } },
    });

    const completed = attempts.filter((a) => a.status === ProgressStatus.COMPLETED);
    const totalAttempts = attempts.length;
    const studentsAttempted = new Set(attempts.map((a) => a.studentId)).size;
    const avgScore =
      completed.length > 0
        ? Math.round((completed.reduce((s, a) => s + a.score, 0) / completed.length) * 100) / 100
        : 0;
    const avgDuration =
      completed.length > 0
        ? Math.round(completed.reduce((s, a) => s + a.duration, 0) / completed.length)
        : 0;
    const passed = completed.filter(
      (a) => a.maxScore > 0 && (a.score / a.maxScore) * 100 >= pc.passScore,
    );
    const passRate =
      completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;

    const stepStats = new Map<string, { attempts: number; correct: number }>();
    for (const a of attempts) {
      const actions = Array.isArray(a.actions)
        ? (a.actions as Array<{ stepId: string; isCorrect: boolean }>)
        : [];
      for (const act of actions) {
        const cur = stepStats.get(act.stepId) ?? { attempts: 0, correct: 0 };
        cur.attempts += 1;
        if (act.isCorrect) cur.correct += 1;
        stepStats.set(act.stepId, cur);
      }
    }

    const stepAnalytics = config.steps.map((step) => {
      const stat = stepStats.get(step.stepId) ?? { attempts: 0, correct: 0 };
      return {
        stepId: step.stepId,
        description: step.description ?? step.stepId,
        attempts: stat.attempts,
        correct: stat.correct,
        correctPercent: stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : 0,
      };
    });

    const violStats = new Map<string, number>();
    for (const a of attempts) {
      const violations = Array.isArray(a.violations)
        ? (a.violations as Array<{ safetyId: string }>)
        : [];
      for (const v of violations) {
        violStats.set(v.safetyId, (violStats.get(v.safetyId) ?? 0) + 1);
      }
    }
    const safetyViolationStats = config.safetyChecklist.map((item) => {
      const count = violStats.get(item.safetyId) ?? 0;
      return {
        safetyId: item.safetyId,
        description: item.description ?? item.safetyId,
        isCritical: item.isCritical === true,
        violationCount: count,
        violationPercent: totalAttempts > 0 ? Math.round((count / totalAttempts) * 100) : 0,
      };
    });

    const bestByStudent = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        studentEmail: string;
        bestScore: number;
        bestMaxScore: number;
        passed: boolean;
        attemptCount: number;
      }
    >();
    for (const a of completed) {
      const key = a.studentId;
      const cur = bestByStudent.get(key);
      const attemptPassed = a.maxScore > 0 && (a.score / a.maxScore) * 100 >= pc.passScore;
      if (!cur || a.score > cur.bestScore) {
        bestByStudent.set(key, {
          studentId: a.studentId,
          studentName: a.student?.name ?? 'Học viên',
          studentEmail: a.student?.email ?? '',
          bestScore: a.score,
          bestMaxScore: a.maxScore,
          passed: attemptPassed,
          attemptCount: (cur?.attemptCount ?? 0) + 1,
        });
      } else if (cur) {
        cur.attemptCount += 1;
      }
    }
    const ranking = [...bestByStudent.values()]
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, 50);

    return {
      totalAttempts,
      studentsAttempted,
      avgScore,
      passRate,
      avgDuration,
      stepAnalytics,
      safetyViolationStats,
      ranking,
    };
  }
}

/**
 * Pull `safetyChecklist.items[]` off a PracticeContent row while
 * tolerating the various shapes the column has evolved through:
 *
 *   - modern:  `{ items: [...] }` (new schema)
 *   - legacy:  `[...]` (some seed data stores the array directly)
 *   - empty:   `null` / `undefined` / `{}`
 *
 * Always returns an array — never throws — so callers can treat the
 * result as `ScoringConfig['safetyChecklist']` without further checks.
 */
function extractSafetyItems(raw: unknown): ScoringConfig['safetyChecklist'] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw as ScoringConfig['safetyChecklist'];
  }
  if (typeof raw === 'object') {
    const withItems = raw as { items?: unknown };
    if (Array.isArray(withItems.items)) {
      return withItems.items as ScoringConfig['safetyChecklist'];
    }
  }
  return [];
}
