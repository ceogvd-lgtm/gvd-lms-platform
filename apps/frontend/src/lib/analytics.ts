/**
 * Phase 15 — typed wrappers around /api/v1/progress/* + /api/v1/analytics/*.
 *
 * Split into two namespaces so the dashboard + instructor/admin pages can
 * import exactly what they need without pulling in unrelated shapes.
 */
import { api } from './api';

// =====================================================
// /progress/*
// =====================================================

export interface StudentCourseRow {
  courseId: string;
  title: string;
  thumbnailUrl: string | null;
  progressPercent: number;
  avgScore: number | null;
  completedLessons: number;
  totalLessons: number;
  lastActiveAt: string;
  enrolledAt: string;
  completedAt: string | null;
}

export interface StudentLessonRow {
  id: string;
  title: string;
  type: 'THEORY' | 'PRACTICE';
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  score: number | null;
  completedAt: string | null;
  timeSpent: number;
}

export interface StudentCourseDetail {
  courseId: string;
  courseTitle: string;
  studentId: string;
  progressPercent: number;
  lessons: StudentLessonRow[];
}

export interface CourseStudentRow {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  progressPercent: number;
  avgScore: number | null;
  isAtRisk: boolean;
  atRiskReasons: string[];
  lastActiveAt: string;
  enrolledAt: string;
}

export type AtRiskReasonCode = 'SLOW_START' | 'INACTIVE' | 'LOW_SCORE' | 'SAFETY_VIOLATION';

export interface AtRiskStudent {
  studentId: string;
  studentName: string;
  studentEmail: string;
  avatar: string | null;
  courseId: string;
  courseTitle: string;
  progressPercent: number;
  lastActiveAt: string;
  avgScore: number | null;
  reasons: AtRiskReasonCode[];
  reasonMessages: string[];
}

export const progressApi = {
  studentCourses: (studentId: string, token: string) =>
    api<StudentCourseRow[]>(`/progress/student/${studentId}/courses`, { token }),

  studentCourseDetail: (studentId: string, courseId: string, token: string) =>
    api<StudentCourseDetail>(`/progress/student/${studentId}/course/${courseId}`, { token }),

  courseStudents: (courseId: string, token: string) =>
    api<CourseStudentRow[]>(`/progress/course/${courseId}/students`, { token }),

  atRisk: (courseId: string | undefined, token: string) => {
    const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
    return api<AtRiskStudent[]>(`/progress/analytics/at-risk${qs}`, { token });
  },
};

// =====================================================
// /analytics/*
// =====================================================

export interface DepartmentAnalytics {
  departmentId: string;
  departmentName: string;
  subjectCount: number;
  courseCount: number;
  studentCount: number;
  completionRate: number;
  avgScore: number | null;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    courseCount: number;
    enrolledCount: number;
    completedCount: number;
    avgScore: number | null;
  }>;
}

export interface SystemAnalytics {
  activeStudentsLast7d: number;
  completionRate: number;
  certificatesIssued: number;
  avgScore: number;
  totalCourses: number;
  totalLessons: number;
  totalStudents: number;
}

export interface LessonDifficultyRow {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  avgScore: number;
  attemptCount: number;
  failRate: number;
  avgTimeSpent: number;
}

export interface HeatmapCell {
  hour: number;
  day: number;
  count: number;
}

export interface CohortPoint {
  cohortMonth: string;
  week: number;
  avgProgress: number;
  studentCount: number;
}

export const analyticsApi = {
  department: (id: string, token: string) =>
    api<DepartmentAnalytics>(`/analytics/department/${id}`, { token }),

  cohort: (token: string) => api<CohortPoint[]>('/analytics/cohort', { token }),

  system: (token: string) => api<SystemAnalytics>('/analytics/system', { token }),

  lessonDifficulty: (token: string) =>
    api<LessonDifficultyRow[]>('/analytics/lesson-difficulty', { token }),

  heatmap: (token: string) => api<HeatmapCell[]>('/analytics/heatmap', { token }),

  /**
   * Export returns a blob download — we side-step the typed `api()` wrapper
   * and call fetch() directly so we can grab the ArrayBuffer.
   */
  exportDownload: async (
    type: 'progress' | 'users' | 'certificates',
    format: 'xlsx' | 'pdf',
    token: string,
  ): Promise<{ blob: Blob; filename: string }> => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
    const res = await fetch(`${baseUrl}/analytics/export?type=${type}&format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Export failed');
      throw new Error(text || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `report.${format}`;
    return { blob, filename };
  },

  scheduleReport: (payload: { recipients: string[]; sendNow?: boolean }, token: string) =>
    api<{ subscribers: string[]; sentNow: { flagged: number; notificationsSent: number } | null }>(
      '/analytics/schedule-report',
      { method: 'POST', body: payload, token },
    ),
};
