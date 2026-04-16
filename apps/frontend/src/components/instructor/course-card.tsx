'use client';

import { Badge, Card, CardContent } from '@lms/ui';
import { Archive, Edit, Eye } from 'lucide-react';
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
  /** Path to the editor — varies by course detail loader. */
  editHref: string;
}

/**
 * Course card for the instructor "Khoá học của tôi" grid.
 *
 * Per CLAUDE.md / Phase 04 rule, instructors **never** see a delete
 * button — only Archive (status FSM transition that admin can revert).
 */
export function CourseCard({ course, onArchive, editHref }: CourseCardProps) {
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
          <Link
            href={editHref}
            className="inline-flex h-8 items-center gap-1 rounded-button bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <Edit className="h-3.5 w-3.5" />
            Chỉnh sửa
          </Link>
          {course.status !== 'ARCHIVED' && (
            <button
              type="button"
              onClick={() => onArchive(course)}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-button bg-surface-2 px-3 text-xs font-semibold text-muted hover:bg-amber-500/10 hover:text-amber-600 transition-colors"
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
