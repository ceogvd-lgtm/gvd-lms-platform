/**
 * Phase 14 — Student dashboard + learning experience API clients.
 *
 * Typed wrappers around /students/* and /lessons/:id/notes +
 * /lessons/:id/discussions. Mirrors the backend response shapes so the
 * dashboard components get autocomplete all the way through.
 */
import { api } from './api';

// =====================================================
// /students/* — dashboard data
// =====================================================

export interface DashboardPayload {
  user: { id: string; name: string; email: string; avatar: string | null; role: string };
  xp: { totalXP: number; level: number };
  overallProgress: { percent: number; completedLessons: number; totalLessons: number };
  streak: { current: number; longest: number };
  enrolledCourses: Array<{
    id: string;
    title: string;
    thumbnailUrl: string | null;
    progressPercent: number;
    nextLessonId: string | null;
    nextLessonTitle: string | null;
  }>;
  nextLesson: { id: string; title: string; courseTitle: string } | null;
  recentScores: Array<{
    lessonTitle: string;
    score: number;
    maxScore: number;
    date: string;
  }>;
}

export interface StreakPayload {
  currentStreak: number;
  longestStreak: number;
  heatmapData: Array<{ date: string; count: number }>;
}

export type LessonStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface MyLearningNode {
  department: { id: string; name: string };
  subjects: Array<{
    id: string;
    name: string;
    avgScore: number;
    courses: Array<{
      id: string;
      title: string;
      thumbnailUrl: string | null;
      progressPercent: number;
      chapters: Array<{
        id: string;
        title: string;
        order: number;
        lessons: Array<{
          id: string;
          title: string;
          type: 'THEORY' | 'PRACTICE';
          status: LessonStatus;
          score: number | null;
          isLocked: boolean;
          estimatedMinutes: number;
        }>;
      }>;
    }>;
  }>;
}

export interface ProgressPayload {
  doughnutData: Array<{ department: string; percent: number }>;
  barChartData: Array<{ subject: string; avgScore: number }>;
  heatmapData: Array<{ date: string; count: number }>;
  timeline: Array<{
    date: string;
    lessonTitle: string;
    type: 'LESSON' | 'QUIZ' | 'PRACTICE';
    score: number | null;
  }>;
  classComparison: { myAvg: number; classAvg: number };
}

export interface MyCertificate {
  id: string;
  code: string;
  issuedAt: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  expiresAt: string | null;
  course: { id: string; title: string; thumbnailUrl: string | null };
}

export interface MyCertificateDetail extends MyCertificate {
  student: { id: string; name: string; email: string };
  instructor: { id: string; name: string } | null;
}

export const studentsApi = {
  dashboard: (token: string) => api<DashboardPayload>('/students/dashboard', { token }),
  streak: (token: string) => api<StreakPayload>('/students/streak', { token }),
  myLearning: (token: string) => api<MyLearningNode[]>('/students/my-learning', { token }),
  progress: (token: string) => api<ProgressPayload>('/students/progress', { token }),
  xp: (token: string) => api<{ totalXP: number; level: number }>('/students/xp', { token }),
  certificates: (token: string) => api<MyCertificate[]>('/students/certificates', { token }),
  certificateDetail: (id: string, token: string) =>
    api<MyCertificateDetail>(`/students/certificates/${id}`, { token }),
};

// =====================================================
// /quiz-attempts — server-graded quiz submission
// =====================================================

export interface QuizAttemptSubmission {
  quizId: string;
  answers: Array<{ questionId: string; answer: unknown }>;
}

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
  startedAt: string;
  completedAt: string | null;
}

export const quizAttemptsApi = {
  submit: (payload: QuizAttemptSubmission, token: string) =>
    api<SubmitAttemptResult>('/quiz-attempts', { method: 'POST', body: payload, token }),

  history: (quizId: string, token: string) =>
    api<AttemptHistoryRow[]>(`/quiz-attempts/${quizId}`, { token }),
};

// =====================================================
// /lessons/:id/notes — per-student TipTap notes
// =====================================================

export interface LessonNote {
  lessonId: string;
  studentId: string;
  content: unknown; // ProseMirror JSON
  updatedAt: string | null;
}

export const lessonNotesApi = {
  get: (lessonId: string, token: string) =>
    api<LessonNote>(`/lessons/${lessonId}/notes`, { token }),

  save: (lessonId: string, content: unknown, token: string) =>
    api<LessonNote>(`/lessons/${lessonId}/notes`, {
      method: 'PUT',
      body: { content },
      token,
    }),
};

// =====================================================
// /lessons/:id/discussions — Q&A threads
// =====================================================

export interface DiscussionAuthorRef {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
}

export interface DiscussionReplyRow {
  id: string;
  discussionId: string;
  content: string;
  createdAt: string;
  isDeleted: boolean;
  author: DiscussionAuthorRef;
}

export interface DiscussionThread {
  id: string;
  lessonId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  author: DiscussionAuthorRef;
  replies: DiscussionReplyRow[];
}

export interface MentionSuggestion {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
}

export const discussionsApi = {
  list: (lessonId: string, token: string) =>
    api<DiscussionThread[]>(`/lessons/${lessonId}/discussions`, { token }),

  create: (
    lessonId: string,
    payload: { content: string; mentionUserIds?: string[] },
    token: string,
  ) =>
    api<DiscussionThread>(`/lessons/${lessonId}/discussions`, {
      method: 'POST',
      body: payload,
      token,
    }),

  reply: (
    discussionId: string,
    payload: { content: string; mentionUserIds?: string[] },
    token: string,
  ) =>
    api<DiscussionReplyRow>(`/discussions/${discussionId}/replies`, {
      method: 'POST',
      body: payload,
      token,
    }),

  deleteThread: (id: string, token: string) =>
    api<{ message: string }>(`/discussions/${id}`, { method: 'DELETE', token }),

  deleteReply: (id: string, token: string) =>
    api<{ message: string }>(`/discussion-replies/${id}`, { method: 'DELETE', token }),

  mentionable: (lessonId: string, q: string, token: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return api<MentionSuggestion[]>(`/lessons/${lessonId}/mentionable${qs}`, { token });
  },
};
