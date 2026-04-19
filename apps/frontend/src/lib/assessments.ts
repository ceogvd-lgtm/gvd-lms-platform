/**
 * Question Bank + Quiz API (Phase 11).
 *
 * Two surfaces are exposed:
 *   `questionsApi` — everything under /questions/*
 *   `quizzesApi`   — lesson-scoped + quiz-scoped endpoints
 *
 * The frontend pre-parses Excel with SheetJS on the client, then POSTs the
 * already-validated rows to /questions/import — the server re-validates
 * (never trust the client) but this keeps the UX snappy.
 */
import { api, type Paginated } from './api';

export type QuestionType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionBank {
  id: string;
  courseId: string | null;
  departmentId: string | null;
  question: string;
  type: QuestionType;
  options: QuestionOption[];
  correctAnswer: string[];
  explanation: string | null;
  difficulty: Difficulty;
  tags: string[];
  points: number;
  createdBy: string;
  creator: { id: string; name: string; email: string; avatar: string | null } | null;
  /**
   * Phase 18 — số quiz đang reference câu hỏi này (qua bảng QuizQuestion).
   * Chỉ trả về ở endpoint list (); findOne/create/update không include.
   * UI dùng để hiện badge "Đang dùng trong N quiz" + disable nút Xoá.
   */
  usedInQuizCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionListFilter {
  q?: string;
  type?: QuestionType;
  difficulty?: Difficulty;
  tags?: string[];
  courseId?: string;
  departmentId?: string;
  createdBy?: 'me' | 'all' | string;
  page?: number;
  limit?: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface QuestionImportPayload {
  questions: Array<
    Omit<QuestionBank, 'id' | 'createdBy' | 'creator' | 'createdAt' | 'updatedAt' | 'correctAnswer'>
  >;
  defaultCourseId?: string;
  defaultDepartmentId?: string;
}

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: ImportRowError[];
  preview?: Array<QuestionImportPayload['questions'][number] & { row: number }>;
}

export interface ExportRow {
  question: string;
  type: QuestionType;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  difficulty: Difficulty;
  tags: string;
  points: number;
}

function toQuery(params: Record<string, unknown> | QuestionListFilter): string {
  const qs = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      v.forEach((x) => qs.append(k, String(x)));
    } else {
      qs.set(k, String(v));
    }
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// =====================================================
// Question Bank API
// =====================================================

export const questionsApi = {
  list: (filter: QuestionListFilter, token: string) =>
    api<Paginated<QuestionBank>>(`/questions${toQuery(filter)}`, { token }),

  tags: (q: string | undefined, token: string, limit = 50) =>
    api<{ tags: TagCount[] }>(`/questions/tags${toQuery({ q, limit })}`, { token }),

  findOne: (id: string, token: string) => api<QuestionBank>(`/questions/${id}`, { token }),

  create: (
    body: Omit<
      QuestionBank,
      'id' | 'createdBy' | 'creator' | 'createdAt' | 'updatedAt' | 'correctAnswer'
    >,
    token: string,
  ) => api<QuestionBank>('/questions', { method: 'POST', body, token }),

  update: (
    id: string,
    body: Partial<
      Omit<
        QuestionBank,
        'id' | 'createdBy' | 'creator' | 'createdAt' | 'updatedAt' | 'correctAnswer'
      >
    >,
    token: string,
  ) => api<QuestionBank>(`/questions/${id}`, { method: 'PATCH', body, token }),

  remove: (id: string, token: string) =>
    api<{ message: string; id: string }>(`/questions/${id}`, { method: 'DELETE', token }),

  importPreview: (body: QuestionImportPayload, token: string) =>
    api<ImportResult>('/questions/import?dryRun=true', { method: 'POST', body, token }),

  import: (body: QuestionImportPayload, token: string) =>
    api<ImportResult>('/questions/import', { method: 'POST', body, token }),

  exportRows: (filter: QuestionListFilter, token: string) =>
    api<{ rows: ExportRow[]; total: number }>(`/questions/export${toQuery(filter)}`, { token }),
};

// =====================================================
// Quiz API
// =====================================================

export interface Quiz {
  id: string;
  lessonId: string;
  title: string;
  timeLimit: number | null;
  shuffleQuestions: boolean;
  showAnswerAfter: boolean;
  passScore: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestionRow {
  id: string;
  questionId: string;
  order: number;
  points: number;
  question: {
    id: string;
    question: string;
    type: QuestionType;
    difficulty: Difficulty;
    tags: string[];
    options: QuestionOption[];
    explanation: string | null;
    correctAnswer: string[];
  };
}

export interface QuizWithQuestions extends Quiz {
  questions: QuizQuestionRow[];
  totalPoints: number;
}

export const quizzesApi = {
  getForLesson: (lessonId: string, token: string, includeAnswers = false) =>
    api<QuizWithQuestions | null>(
      `/lessons/${lessonId}/quiz${includeAnswers ? '?includeAnswers=true' : ''}`,
      { token },
    ),

  createForLesson: (
    lessonId: string,
    body: {
      title: string;
      timeLimit?: number | null;
      shuffleQuestions?: boolean;
      showAnswerAfter?: boolean;
      passScore: number;
      maxAttempts?: number;
    },
    token: string,
  ) => api<Quiz>(`/lessons/${lessonId}/quiz`, { method: 'POST', body, token }),

  update: (id: string, body: Partial<Quiz>, token: string) =>
    api<Quiz>(`/quizzes/${id}`, { method: 'PATCH', body, token }),

  remove: (id: string, token: string) =>
    api<{ message: string; id: string }>(`/quizzes/${id}`, { method: 'DELETE', token }),

  addQuestion: (quizId: string, questionId: string, token: string, points?: number) =>
    api<QuizQuestionRow>(`/quizzes/${quizId}/questions`, {
      method: 'POST',
      body: { questionId, points },
      token,
    }),

  addQuestionsBulk: (quizId: string, questionIds: string[], token: string) =>
    api<{ added: number; skipped: number }>(`/quizzes/${quizId}/questions/bulk`, {
      method: 'POST',
      body: { questionIds },
      token,
    }),

  randomPick: (
    quizId: string,
    body: {
      count: number;
      type?: QuestionType;
      difficulty?: Difficulty;
      tags?: string[];
      courseId?: string;
    },
    token: string,
  ) =>
    api<{ added: number; skipped: number; pool: number }>(
      `/quizzes/${quizId}/questions/random-pick`,
      { method: 'POST', body, token },
    ),

  removeQuestion: (quizId: string, questionId: string, token: string) =>
    api<{ message: string }>(`/quizzes/${quizId}/questions/${questionId}`, {
      method: 'DELETE',
      token,
    }),

  reorder: (quizId: string, orderedIds: string[], token: string) =>
    api<{ message: string; count: number }>(`/quizzes/${quizId}/questions/reorder`, {
      method: 'PATCH',
      body: { orderedIds },
      token,
    }),
};
