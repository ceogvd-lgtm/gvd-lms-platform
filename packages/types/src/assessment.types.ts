/**
 * Quiz / Question / Certificate types.
 */
import type { ID, Timestamped } from './common.types';

export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  TRUE_FALSE = 'TRUE_FALSE',
  SHORT_ANSWER = 'SHORT_ANSWER',
}

export interface Quiz extends Timestamped {
  id: ID;
  lessonId: ID;
  title: string;
  passingScore: number;
  timeLimitSeconds: number | null;
  maxAttempts: number;
}

export interface Question extends Timestamped {
  id: ID;
  quizId: ID;
  type: QuestionType;
  prompt: string;
  points: number;
  order: number;
  options: QuestionOption[];
}

export interface QuestionOption {
  id: ID;
  text: string;
  isCorrect: boolean;
}

export interface QuizAttempt extends Timestamped {
  id: ID;
  userId: ID;
  quizId: ID;
  score: number;
  passed: boolean;
  startedAt: Date;
  submittedAt: Date | null;
}

export interface Certificate extends Timestamped {
  id: ID;
  userId: ID;
  courseId: ID;
  certificateNumber: string;
  issuedAt: Date;
  pdfUrl: string;
}
