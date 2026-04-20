/**
 * Curriculum API wrappers — Departments / Subjects / Courses / Chapters /
 * Lessons / Enrollments. All routes live under `/api/v1/`.
 *
 * Types are intentionally loose (unknown on nested relations) — components
 * narrow when they need to. This keeps the shared lib small and avoids
 * duplicating the full Prisma shape here.
 */
import { api } from './api';

export type CourseStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type LessonType = 'THEORY' | 'PRACTICE';

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  order: number;
  isActive: boolean;
  _count?: { subjects: number };
}

export interface Subject {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  description: string | null;
  thumbnailUrl: string | null;
  order: number;
  department?: { id: string; name: string; code: string };
  _count?: { courses: number };
}

export interface Course {
  id: string;
  subjectId: string;
  instructorId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  status: CourseStatus;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subject?: { id: string; name: string; code: string };
  instructor?: { id: string; name: string; email: string };
  _count?: { chapters: number; enrollments: number };
}

export interface Chapter {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  order: number;
  lessons?: Lesson[];
}

export interface Lesson {
  id: string;
  chapterId: string;
  title: string;
  type: LessonType;
  order: number;
  isPublished: boolean;
}

export interface CourseDetail extends Course {
  chapters: Chapter[];
}

export type StatusAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'ARCHIVE' | 'UNARCHIVE';

// =====================================================
// Departments
// =====================================================

export const departmentsApi = {
  list: (includeInactive = false) =>
    api<Department[]>(`/departments${includeInactive ? '?includeInactive=true' : ''}`),

  create: (
    body: {
      name: string;
      code: string;
      description?: string;
      order?: number;
    },
    token: string,
  ) => api<Department>('/departments', { method: 'POST', body, token }),

  update: (
    id: string,
    body: Partial<{ name: string; description: string; order: number; isActive: boolean }>,
    token: string,
  ) => api<Department>(`/departments/${id}`, { method: 'PATCH', body, token }),

  remove: (id: string, token: string) =>
    api<{ message: string }>(`/departments/${id}`, {
      method: 'DELETE',
      token,
    }),
};

// =====================================================
// Subjects
// =====================================================

export const subjectsApi = {
  list: (departmentId?: string) =>
    api<Subject[]>(`/subjects${departmentId ? `?departmentId=${departmentId}` : ''}`),

  create: (
    body: {
      departmentId: string;
      name: string;
      code: string;
      description?: string;
    },
    token: string,
  ) => api<Subject>('/subjects', { method: 'POST', body, token }),

  update: (
    id: string,
    body: Partial<{ name: string; description: string; order: number }>,
    token: string,
  ) => api<Subject>(`/subjects/${id}`, { method: 'PATCH', body, token }),

  /** DELETE /subjects/:id — soft delete môn (ADMIN+); reject nếu còn khoá active. */
  remove: (id: string, token: string) =>
    api<{ message: string }>(`/subjects/${id}`, { method: 'DELETE', token }),
};

// =====================================================
// Courses
// =====================================================

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const coursesApi = {
  list: (
    params: {
      q?: string;
      subjectId?: string;
      departmentId?: string;
      status?: CourseStatus;
      instructorId?: string;
      page?: number;
      limit?: number;
    },
    token: string,
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return api<Paginated<Course>>(`/courses${q ? `?${q}` : ''}`, { token });
  },

  findOne: (id: string, token: string) => api<CourseDetail>(`/courses/${id}`, { token }),

  create: (
    body: {
      subjectId: string;
      title: string;
      description?: string;
    },
    token: string,
  ) => api<Course>('/courses', { method: 'POST', body, token }),

  update: (
    id: string,
    body: Partial<{ title: string; description: string; subjectId: string }>,
    token: string,
  ) => api<Course>(`/courses/${id}`, { method: 'PATCH', body, token }),

  updateStatus: (id: string, action: StatusAction, token: string, reason?: string) =>
    api<Course>(`/courses/${id}/status`, {
      method: 'PATCH',
      body: { action, reason },
      token,
    }),

  remove: (id: string, token: string) =>
    api<{ message: string }>(`/courses/${id}`, { method: 'DELETE', token }),
};

// =====================================================
// Chapters
// =====================================================

export const chaptersApi = {
  listByCourse: (courseId: string, token: string) =>
    api<Chapter[]>(`/courses/${courseId}/chapters`, { token }),

  create: (courseId: string, body: { title: string; description?: string }, token: string) =>
    api<Chapter>(`/courses/${courseId}/chapters`, {
      method: 'POST',
      body,
      token,
    }),

  update: (id: string, body: Partial<{ title: string; description: string }>, token: string) =>
    api<Chapter>(`/chapters/${id}`, { method: 'PATCH', body, token }),

  reorder: (id: string, newOrder: number, token: string) =>
    api<{ message: string }>(`/chapters/${id}/reorder`, {
      method: 'PATCH',
      body: { newOrder },
      token,
    }),

  remove: (id: string, token: string) =>
    api<{ message: string }>(`/chapters/${id}`, { method: 'DELETE', token }),
};

// =====================================================
// Lessons
// =====================================================

export interface LessonContext {
  lesson: { id: string; title: string; type: LessonType; order: number };
  chapter: { id: string; title: string; order: number };
  course: {
    id: string;
    title: string;
    /**
     * Phase 18 — trạng thái FSM của course chứa bài giảng này.
     * Trang /instructor/lessons/:id/edit dùng để hiện nút "Gửi duyệt"
     * khi status === 'DRAFT' (để giảng viên submit course sau khi đã
     * soạn xong hết bài). `status?` optional để tương thích response cũ.
     */
    status?: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED' | 'REJECTED';
    instructorId?: string;
  };
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}

export const lessonsApi = {
  createInChapter: (
    chapterId: string,
    body: { title: string; type: LessonType; order?: number },
    token: string,
  ) =>
    api<Lesson>(`/chapters/${chapterId}/lessons`, {
      method: 'POST',
      body,
      token,
    }),

  update: (
    id: string,
    body: Partial<{ title: string; isPublished: boolean; order: number }>,
    token: string,
  ) => api<Lesson>(`/lessons/${id}`, { method: 'PATCH', body, token }),

  reorder: (id: string, newOrder: number, token: string) =>
    api<{ message: string }>(`/lessons/${id}/reorder`, {
      method: 'PATCH',
      body: { newOrder },
      token,
    }),

  remove: (id: string, token: string) =>
    api<{ message: string }>(`/lessons/${id}`, { method: 'DELETE', token }),

  /** GET /lessons/:id/context — metadata for outline sidebar + prev/next nav. */
  getContext: (id: string, token: string) =>
    api<LessonContext>(`/lessons/${id}/context`, { token }),
};

// =====================================================
// Enrollments
// =====================================================

export interface MyEnrollment {
  enrollmentId: string;
  enrolledAt: string;
  completedAt: string | null;
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    status: CourseStatus;
  };
  totalLessons: number;
  completedLessons: number;
  /** 0–100 */
  progress: number;
  /** First non-completed lesson in the course, or null if course has no lessons. */
  nextLessonId: string | null;
  nextLessonTitle: string | null;
}

export const enrollmentsApi = {
  /** GET /enrollments/me — my enrollments + per-course progress for the dashboard. */
  me: (token: string) => api<MyEnrollment[]>('/enrollments/me', { token }),

  enroll: (courseId: string, token: string) =>
    api<{ id: string }>('/enrollments', {
      method: 'POST',
      body: { courseId },
      token,
    }),
};
