'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, FileText, PlayCircle, Wrench } from 'lucide-react';

import { instructorAnalyticsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string | null;
  courseId: string | null;
  studentName?: string;
  courseTitle?: string;
}

const STATUS_ICON = {
  COMPLETED: CheckCircle2,
  IN_PROGRESS: PlayCircle,
  NOT_STARTED: Circle,
} as const;

const STATUS_COLOR = {
  COMPLETED: 'text-emerald-600 dark:text-emerald-400',
  IN_PROGRESS: 'text-amber-600 dark:text-amber-400',
  NOT_STARTED: 'text-muted',
} as const;

/**
 * Per-student detail drawer for /instructor/analytics. Loads on open.
 */
export function StudentDetailModal({
  open,
  onClose,
  studentId,
  courseId,
  studentName,
  courseTitle,
}: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const detail = useQuery({
    queryKey: ['student-detail', studentId, courseId],
    queryFn: () => instructorAnalyticsApi.getStudentDetail(studentId!, courseId!, accessToken!),
    enabled: open && !!studentId && !!courseId && !!accessToken,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Chi tiết tiến độ học viên</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-card bg-surface-2/50 p-3">
            <p className="text-sm font-semibold text-foreground">
              {detail.data?.student.name ?? studentName ?? '—'}
            </p>
            <p className="text-xs text-muted">{detail.data?.course.title ?? courseTitle ?? '—'}</p>
          </div>

          {detail.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-surface-2" />
              ))}
            </div>
          ) : detail.isError ? (
            <p className="py-6 text-center text-sm text-red-600">
              {(detail.error as Error).message}
            </p>
          ) : detail.data?.lessons.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Khoá học chưa có bài giảng nào.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <ul className="space-y-2">
                {detail.data?.lessons.map((l) => {
                  const StatusIcon = STATUS_ICON[l.status];
                  const TypeIcon = l.lessonType === 'THEORY' ? FileText : Wrench;
                  return (
                    <li
                      key={l.lessonId}
                      className="flex items-center gap-3 rounded-card border border-border p-3"
                    >
                      <StatusIcon className={'h-5 w-5 shrink-0 ' + STATUS_COLOR[l.status]} />
                      <TypeIcon className="h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {l.lessonTitle}
                        </p>
                        <p className="truncate text-xs text-muted">{l.chapterTitle}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        {l.score !== null && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {l.score} đ
                          </span>
                        )}
                        {l.attempts > 0 && <span>{l.attempts} lần thử</span>}
                        {l.timeSpentSec > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.round(l.timeSpentSec / 60)} phút
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
