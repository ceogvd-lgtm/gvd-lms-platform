'use client';

import { Badge, Button, Card, CardContent } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronDown, ChevronRight, GraduationCap, Play } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { chaptersApi, enrollmentsApi, type MyEnrollment } from '@/lib/curriculum';

/**
 * Student dashboard — "Khoá học của tôi".
 *
 * Lightweight Phase-13.5 stop-gap until Phase 14 ships the full student
 * learning experience. Lists every course the signed-in user has
 * enrolled in plus per-course progress (derived server-side from
 * LessonProgress rows). Each card is expandable to reveal the chapter
 * tree so the student can jump straight to a specific lesson.
 *
 * States:
 *   - Loading   → skeleton cards
 *   - Error     → inline error with retry button
 *   - Empty     → friendly "chưa được enroll" hint
 *   - Happy     → cards with thumbnail + progress + Tiếp tục học
 *
 * All visuals live in Tailwind tokens so Light + Dark mode both work
 * without per-page overrides.
 */
export default function StudentDashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const query = useQuery({
    queryKey: ['my-enrollments', user?.id],
    queryFn: () => enrollmentsApi.me(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Khoá học của tôi</h1>
        <p className="text-sm text-muted">
          Tiếp tục các khoá học bạn đã ghi danh. Nhấn vào thẻ để xem danh sách bài giảng.
        </p>
      </header>

      {query.isLoading && <LoadingGrid />}

      {query.isError && (
        <Card className="border-error/30 bg-error/5">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm font-semibold text-error">Không tải được khoá học</p>
            <p className="max-w-md text-xs text-muted">
              {query.error instanceof Error ? query.error.message : 'Lỗi không xác định'}
            </p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <GraduationCap className="h-7 w-7" />
            </div>
            <p className="text-base font-semibold text-foreground">
              Bạn chưa được enroll khoá học nào
            </p>
            <p className="max-w-md text-sm text-muted">
              Liên hệ Quản trị viên để được thêm vào một khoá học, hoặc chờ khoá học mới được mở
              đăng ký.
            </p>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((e) => (
            <EnrollmentCard key={e.enrollmentId} enrollment={e} accessToken={accessToken!} />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// Card — collapsed by default, expands to show chapter/lesson tree.
// =====================================================
function EnrollmentCard({
  enrollment,
  accessToken,
}: {
  enrollment: MyEnrollment;
  accessToken: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { course, progress, totalLessons, completedLessons, nextLessonId } = enrollment;

  const tree = useQuery({
    queryKey: ['student-outline', course.id],
    queryFn: () => chaptersApi.listByCourse(course.id, accessToken),
    enabled: expanded,
  });

  return (
    <Card className="flex flex-col overflow-hidden">
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
            <BookOpen className="h-8 w-8 opacity-40" />
          </div>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-base font-semibold text-foreground">{course.title}</h3>
          <Badge tone={progress === 100 ? 'success' : 'info'}>{progress}%</Badge>
        </div>

        {course.description && (
          <p className="line-clamp-2 text-sm text-muted">{course.description}</p>
        )}

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {completedLessons}/{totalLessons} bài đã xong
            </span>
            {progress === 100 && <span className="font-semibold text-success">Hoàn thành</span>}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className={
                'h-full rounded-full transition-all duration-300 ' +
                (progress === 100 ? 'bg-success' : 'bg-primary')
              }
              style={{ width: `${Math.max(2, progress)}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-2">
          {nextLessonId ? (
            <Button asChild size="sm" className="flex-1">
              <Link href={`/student/lessons/${nextLessonId}`}>
                <Play className="h-3.5 w-3.5" />
                {completedLessons > 0 ? 'Tiếp tục học' : 'Bắt đầu học'}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled className="flex-1">
              Khoá chưa có bài học
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        {/* Expanded tree */}
        {expanded && (
          <div className="mt-2 border-t border-border pt-3">
            {tree.isLoading && <p className="text-xs text-muted">Đang tải cây bài học…</p>}
            {tree.isError && <p className="text-xs text-error">Không tải được danh sách.</p>}
            {tree.data && tree.data.length === 0 && (
              <p className="text-xs text-muted">Khoá học chưa có chương nào.</p>
            )}
            {tree.data && tree.data.length > 0 && (
              <ul className="space-y-3">
                {tree.data.map((chapter) => (
                  <li key={chapter.id}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {chapter.title}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {(chapter.lessons ?? []).map((lesson) => (
                        <li key={lesson.id}>
                          <Link
                            href={`/student/lessons/${lesson.id}`}
                            className="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-surface-2 transition-colors"
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" />
                            <span className="flex-1 truncate">{lesson.title}</span>
                            {lesson.type === 'PRACTICE' && (
                              <span className="rounded bg-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                                TH
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================
// Loading skeleton — 3 card placeholders.
// =====================================================
function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="aspect-video w-full animate-pulse bg-surface-2" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
            <div className="h-2 w-full animate-pulse rounded bg-surface-2" />
            <div className="mt-4 h-8 w-full animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
