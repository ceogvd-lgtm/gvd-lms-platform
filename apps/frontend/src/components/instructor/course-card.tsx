'use client';

import { Badge, Card, CardContent } from '@lms/ui';
import { Archive, Edit, Eye, RotateCcw, Send } from 'lucide-react';
import Link from 'next/link';

import type { Course } from '@/lib/curriculum';

const STATUS_TONE: Record<Course['status'], 'info' | 'success' | 'warning' | 'neutral'> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

interface CourseCardProps {
  course: Course;
  /** Triggered when instructor clicks the archive action. */
  onArchive: (course: Course) => void;
  /**
   * Triggered when instructor clicks "Gửi duyệt". Only shown for DRAFT
   * courses. If omitted, the button is hidden (e.g. admin-only views).
   */
  onSubmitForReview?: (course: Course) => void;
  /**
   * Phase 18 — triggered when instructor clicks "Huỷ gửi duyệt" trên card.
   * Chỉ hiện khi course.status === PENDING_REVIEW. Thay thế "Chỉnh sửa"
   * vì course đang chờ duyệt thì không cho sửa (bảo toàn snapshot admin
   * đang review); user phải withdraw trước để lấy lại quyền edit.
   */
  onWithdraw?: (course: Course) => void;
  /** Path to the editor — varies by course detail loader. */
  editHref: string;
}

/**
 * Course card for the instructor "Khoá học của tôi" grid.
 *
 * Per CLAUDE.md / Phase 04 rule, instructors **never** see a delete
 * button — only Archive (status FSM transition that admin can revert).
 */
export function CourseCard({
  course,
  onArchive,
  onSubmitForReview,
  onWithdraw,
  editHref,
}: CourseCardProps) {
  const canSubmit = course.status === 'DRAFT' && onSubmitForReview;
  // Phase 18 — PENDING_REVIEW: khoá "Chỉnh sửa" để tránh instructor sửa
  // khi admin đang review (stale snapshot); chỉ hiện "Huỷ gửi duyệt"
  // + "Xem" (readonly) + "Lưu trữ" (archive pending course cũng OK vì
  // trạng thái archive không conflict với review flow).
  const isPendingReview = course.status === 'PENDING_REVIEW';
  const canEdit = !isPendingReview;
  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
      <div className="aspect-video w-full overflow-hidden bg-surface-2">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.thumbnailUrl}
            alt={course.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            Chưa có ảnh
          </div>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-base font-semibold text-foreground">{course.title}</h3>
          <Badge tone={STATUS_TONE[course.status]}>{course.status}</Badge>
        </div>
        {course.description && (
          <p className="line-clamp-2 text-sm text-muted">{course.description}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{course._count?.chapters ?? 0} chương</span>
          <span>·</span>
          <span>{course._count?.enrollments ?? 0} học viên</span>
        </div>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Link
            href={`/courses/${course.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-button border border-border px-3 text-xs font-semibold text-muted hover:border-primary hover:text-primary transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Xem
          </Link>
          {/* Phase 18 — "Chỉnh sửa" CHỈ hiện khi không phải PENDING_REVIEW.
              Khi đang chờ duyệt, thay bằng "Huỷ gửi duyệt" (amber) để user
              rút bài trước khi chỉnh. */}
          {canEdit && (
            <Link
              href={editHref}
              className="inline-flex h-8 items-center gap-1 rounded-button bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Edit className="h-3.5 w-3.5" />
              Chỉnh sửa
            </Link>
          )}
          {isPendingReview && onWithdraw && (
            <button
              type="button"
              onClick={() => onWithdraw(course)}
              className="inline-flex h-8 items-center gap-1 rounded-button bg-amber-500/10 px-3 text-xs font-semibold text-amber-600 hover:bg-amber-500/20 transition-colors dark:text-amber-400"
              title="Huỷ gửi duyệt để tiếp tục chỉnh sửa"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Huỷ gửi duyệt
            </button>
          )}
          {canSubmit && (
            <button
              type="button"
              onClick={() => onSubmitForReview!(course)}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-button bg-primary px-3 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
              title="Gửi duyệt cho Admin"
            >
              <Send className="h-3.5 w-3.5" />
              Gửi duyệt
            </button>
          )}
          {course.status !== 'ARCHIVED' && (
            <button
              type="button"
              onClick={() => onArchive(course)}
              className={
                'inline-flex h-8 items-center gap-1 rounded-button bg-surface-2 px-3 text-xs font-semibold text-muted hover:bg-amber-500/10 hover:text-amber-600 transition-colors ' +
                // When there's no Gửi duyệt button pushing it rightward,
                // we still want Archive hugging the right edge of the card.
                (canSubmit ? '' : 'ml-auto')
              }
              title="Lưu trữ khoá học"
            >
              <Archive className="h-3.5 w-3.5" />
              Lưu trữ
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
