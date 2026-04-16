/**
 * Quiz / Question / Certificate types.
 *
 * Synced with `packages/database/prisma/schema.prisma` — field names must
 * match Prisma exactly (no camelCase-tweak variants).
 */
import type { ID, Timestamped } from './common.types';

// =========================================================
// ENUMS (structural const-objects, mirrors Prisma enums)
// =========================================================

export const QuestionType = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTI_CHOICE: 'MULTI_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
  FILL_BLANK: 'FILL_BLANK',
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

// =========================================================
// QUESTION OPTION — shape stored in QuestionBank.options Json
// =========================================================

/**
 * A single answer option. For TRUE_FALSE we still use two options
 * (`id: 'true' | 'false'`). For FILL_BLANK we store the accepted answers
 * as options where `isCorrect === true` and the text IS the accepted answer;
 * comparison is case-insensitive + trimmed at grading time.
 */
export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

// =========================================================
// QUESTION BANK
// =========================================================

export interface QuestionBank extends Timestamped {
  id: ID;
  courseId: ID | null;
  departmentId: ID | null;
  question: string;
  type: QuestionType;
  options: QuestionOption[];
  /**
   * Redundant convenience field: IDs of options with isCorrect === true.
   * Grading logic reads `options[*].isCorrect` as the source of truth;
   * this array is denormalised for faster client rendering.
   */
  correctAnswer: string[];
  explanation: string | null;
  difficulty: Difficulty;
  tags: string[];
  points: number;
  createdBy: ID;
}

// =========================================================
// QUIZ + QUIZ-QUESTION JOIN
// =========================================================

export interface Quiz extends Timestamped {
  id: ID;
  lessonId: ID;
  title: string;
  timeLimit: number | null; // seconds; null = no limit
  shuffleQuestions: boolean;
  showAnswerAfter: boolean;
  passScore: number; // 0-100 percentage
  maxAttempts: number;
}

export interface QuizQuestion {
  id: ID;
  quizId: ID;
  questionId: ID;
  order: number;
  points: number;
}

/** Quiz with its question list, fully hydrated (question bank joined). */
export interface QuizWithQuestions extends Quiz {
  questions: Array<
    QuizQuestion & {
      question: QuestionBank;
    }
  >;
  totalPoints: number;
}

export interface QuizAttempt extends Timestamped {
  id: ID;
  quizId: ID;
  studentId: ID;
  score: number;
  maxScore: number;
  answers: unknown; // { [questionId]: string | string[] }
  startedAt: Date;
  completedAt: Date | null;
}

// =========================================================
// CERTIFICATE (kept as-is from earlier phases)
// =========================================================

export interface Certificate extends Timestamped {
  id: ID;
  studentId: ID;
  courseId: ID;
  code: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}
