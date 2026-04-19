/**
 * Admin question-bank API client (Phase 18).
 *
 * Tách riêng khỏi `assessments.ts` (instructor-facing) vì scope khác nhau:
 *   - `/questions` (instructor) → lọc theo createdBy của actor
 *   - `/admin/questions` (admin) → thấy tất cả, filter instructorId / subjectId
 *
 * Trang `/admin/questions` dùng các helpers ở đây. Nút "Xoá 1 câu" tái
 * sử dụng `questionsApi.remove()` từ `assessments.ts` vì endpoint backend
 * `DELETE /questions/:id` đã support ADMIN bypass ownership.
 */
import { api, type Paginated } from './api';
import type { Difficulty, QuestionBank, QuestionType } from './assessments';

export interface AdminQuestionFilter {
  q?: string;
  type?: QuestionType;
  difficulty?: Difficulty;
  instructorId?: string;
  subjectId?: string;
  courseId?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}

export interface BulkDeleteResult {
  deleted: number;
  skipped: number;
  skippedIds: string[];
  deletedIds: string[];
}

function toQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const adminQuestionsApi = {
  list: (filter: AdminQuestionFilter, token: string) =>
    api<Paginated<QuestionBank>>(`/admin/questions${toQuery(filter as Record<string, unknown>)}`, {
      token,
    }),

  /**
   * Xoá hàng loạt — server đã lọc ra câu đang dùng trong quiz, trả về
   * { deleted, skipped, skippedIds, deletedIds } để UI hiển thị.
   */
  bulkDelete: (ids: string[], token: string) =>
    api<BulkDeleteResult>('/admin/questions/bulk', {
      method: 'DELETE',
      body: { ids },
      token,
    }),
};
