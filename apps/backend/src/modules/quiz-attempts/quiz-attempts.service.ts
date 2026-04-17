import { ProgressStatus, QuestionType } from '@lms/database';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { XpService, XpReason } from '../students/xp.service';

import type { SubmitAttemptDto } from './dto/submit-attempt.dto';

// =====================================================
// Grading primitives — pure functions, no DB, used by the service
// AND by unit tests to pin the scoring algorithm.
// =====================================================

/**
 * Compare an index-based submission (SINGLE_CHOICE / TRUE_FALSE / MULTI_CHOICE).
 * Returns true iff the submitted set matches the correct set exactly.
 */
function compareIndexAnswer(submitted: unknown, correct: unknown): boolean {
  const submittedArr = Array.isArray(submitted)
    ? submitted
    : typeof submitted === 'number'
      ? [submitted]
      : [];
  const correctArr = Array.isArray(correct)
    ? correct
    : typeof correct === 'number'
      ? [correct]
      : [];

  if (submittedArr.length !== correctArr.length) return false;

  const submittedSet = new Set(submittedArr.map(Number));
  for (const c of correctArr) {
    if (!submittedSet.has(Number(c))) return false;
  }
  return true;
}

/**
 * FILL_BLANK: submitted is a string; correct is either a single string or
 * an array of acceptable strings. Match is case-insensitive + whitespace
 * trimmed on both sides.
 */
function compareFillBlankAnswer(submitted: unknown, correct: unknown): boolean {
  if (typeof submitted !== 'string') return false;
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(submitted);

  if (typeof correct === 'string') return norm(correct) === target;
  if (Array.isArray(correct)) {
    return correct.some((c) => typeof c === 'string' && norm(c) === target);
  }
  return false;
}

export function gradeAnswer(type: QuestionType, submitted: unknown, correct: unknown): boolean {
  switch (type) {
    case QuestionType.FILL_BLANK:
      return compareFillBlankAnswer(submitted, correct);
    case QuestionType.SINGLE_CHOICE:
    case QuestionType.MULTI_CHOICE:
    case QuestionType.TRUE_FALSE:
      return compareIndexAnswer(submitted, correct);
    default:
      return false;
  }
}

// =====================================================
// Response shapes — exported so frontend can type the fetch without
// pulling Prisma runtime types.
// =====================================================

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  awarded: number;
  maxPoints: number;
  explanation: string | null;
}

export interface SubmitAttemptResult {
  attemptId: string;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  passScore: number;
  results: QuestionResult[];
}

export interface AttemptHistoryRow {
  id: string;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

// =====================================================
// Service
// =====================================================

interface GradedAnswer extends QuestionResult {}

@Injectable()
export class QuizAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xp: XpService,
  ) {}

  /**
   * POST /quiz-attempts — grade synchronously, persist, cascade progress.
   *
   * Flow:
   *   1. Load quiz with its questions (via QuizQuestion join) + lesson id
   *   2. Validate every submitted questionId maps to a quiz question
   *   3. For each QuizQuestion: grade(submittedAnswer, question.correctAnswer)
   *      → award full `points` or 0 (no partial credit for now)
   *   4. score = sum of awarded, maxScore = sum of points
   *   5. passed = score >= quiz.passScore (interpreted as percent of maxScore)
   *   6. Insert QuizAttempt row with completedAt = now
   *   7. If passed AND this is the student's FIRST passing attempt on
   *      the quiz: cascade LessonProgress → COMPLETED + award quiz-pass XP
   */
  async submitAttempt(studentId: string, dto: SubmitAttemptDto): Promise<SubmitAttemptResult> {
    const quiz = await this.prisma.client.quiz.findUnique({
      where: { id: dto.quizId },
      include: {
        questions: {
          include: {
            question: {
              select: { id: true, type: true, correctAnswer: true, explanation: true },
            },
          },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Không tìm thấy quiz');
    if (quiz.questions.length === 0) {
      throw new BadRequestException('Quiz này chưa có câu hỏi nào');
    }

    // Build lookup: questionId → submitted answer
    const submittedByQuestionId = new Map<string, unknown>(
      dto.answers.map((a) => [a.questionId, a.answer]),
    );

    let score = 0;
    let maxScore = 0;
    const results: GradedAnswer[] = [];

    for (const qq of quiz.questions) {
      maxScore += qq.points;
      const submitted = submittedByQuestionId.get(qq.questionId);
      const correct =
        submitted !== undefined
          ? gradeAnswer(qq.question.type, submitted, qq.question.correctAnswer)
          : false;
      const awarded = correct ? qq.points : 0;
      score += awarded;
      results.push({
        questionId: qq.questionId,
        correct,
        awarded,
        maxPoints: qq.points,
        explanation: qq.question.explanation,
      });
    }

    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    // quiz.passScore is a percent threshold (e.g. 70 = 70%).
    const passed = percent >= quiz.passScore;

    // Check whether the student already had a passing attempt — drives
    // first-time-only XP awards + avoids re-marking LessonProgress.
    const priorPass = passed
      ? await this.prisma.client.quizAttempt.findFirst({
          where: { quizId: quiz.id, studentId },
          orderBy: { completedAt: 'desc' },
          select: { id: true, score: true, maxScore: true },
        })
      : null;
    const hadPriorPass =
      !!priorPass && (priorPass.score / Math.max(1, priorPass.maxScore)) * 100 >= quiz.passScore;

    const now = new Date();
    const attempt = await this.prisma.client.quizAttempt.create({
      data: {
        quizId: quiz.id,
        studentId,
        score,
        maxScore,
        answers: dto.answers as unknown as object,
        completedAt: now,
      },
    });

    // Cascade to LessonProgress + XP only on first-ever pass.
    if (passed) {
      await this.prisma.client.lessonProgress.upsert({
        where: { lessonId_studentId: { lessonId: quiz.lessonId, studentId } },
        update: {
          status: ProgressStatus.COMPLETED,
          completedAt: now,
          lastViewAt: now,
          score: percent,
        },
        create: {
          lessonId: quiz.lessonId,
          studentId,
          status: ProgressStatus.COMPLETED,
          completedAt: now,
          lastViewAt: now,
          score: percent,
        },
      });

      if (!hadPriorPass) {
        await this.xp.award(studentId, XpReason.QUIZ_PASSED, 20);
      }
    }

    return {
      attemptId: attempt.id,
      score,
      maxScore,
      percent,
      passed,
      passScore: quiz.passScore,
      results,
    };
  }

  /** GET /quiz-attempts/:quizId — caller's own attempt history. */
  async listMyAttempts(studentId: string, quizId: string): Promise<AttemptHistoryRow[]> {
    const rows = await this.prisma.client.quizAttempt.findMany({
      where: { quizId, studentId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    const quiz = await this.prisma.client.quiz.findUnique({
      where: { id: quizId },
      select: { passScore: true },
    });
    const passScore = quiz?.passScore ?? 0;

    return rows.map((r) => {
      const percent = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
      return {
        id: r.id,
        score: r.score,
        maxScore: r.maxScore,
        percent,
        passed: percent >= passScore,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      };
    });
  }
}
