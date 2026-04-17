'use client';

import { Badge, Button, Card, CardContent } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Flame, GraduationCap, Play, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import Link from 'next/link';

import { useAuthStore } from '@/lib/auth-store';
import { studentsApi, type DashboardPayload } from '@/lib/students';

/**
 * Student dashboard — Phase 14.
 *
 * Full 6-row layout replacing the Phase-13.5 stub:
 *   1. Greeting + motivational quote
 *   2. 3 stats cards: circular progress · streak · XP level
 *   3. Enrolled courses grid
 *   4. "Next lesson" CTA banner
 *   5. Recent quiz scores (sparkline)
 *   6. Recent notifications (stub — Phase 7 socket feeds drive it)
 *
 * All data comes from GET /api/v1/students/dashboard (single round-trip
 * so the first paint is fast). Individual components can still hit their
 * own endpoints for richer states (see /student/progress for charts).
 */
export default function StudentDashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => studentsApi.dashboard(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      {query.isLoading && <LoadingGrid />}

      {query.isError && (
        <Card className="border-error/30 bg-error/5">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm font-semibold text-error">Không tải được dashboard</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && <DashboardBody data={query.data} />}
    </div>
  );
}

// =====================================================
// Main body — 6 rows per Phase 14 spec
// =====================================================
function DashboardBody({ data }: { data: DashboardPayload }) {
  const quote = pickQuote(data.user.id);

  return (
    <div className="space-y-6">
      {/* Row 1 — Greeting */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Xin chào {data.user.name}! 👋
        </h1>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          · <span className="italic">{quote}</span>
        </p>
      </header>

      {/* Row 2 — Stats trio */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <OverallProgressCard
          percent={data.overallProgress.percent}
          completed={data.overallProgress.completedLessons}
          total={data.overallProgress.totalLessons}
        />
        <StreakCard current={data.streak.current} longest={data.streak.longest} />
        <XpCard totalXP={data.xp.totalXP} level={data.xp.level} />
      </div>

      {/* Row 3 — Enrolled courses */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <BookOpen className="h-5 w-5 text-primary" />
          Khoá học đang học
        </h2>
        {data.enrolledCourses.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted">
              Bạn chưa được enroll khoá học nào.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.enrolledCourses.map((c) => (
              <EnrolledCourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </section>

      {/* Row 4 — Next-lesson CTA */}
      {data.nextLesson && (
        <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Bài học tiếp theo
              </p>
              <h3 className="mt-1 truncate text-lg font-bold text-foreground">
                {data.nextLesson.title}
              </h3>
              <p className="text-sm text-muted">{data.nextLesson.courseTitle}</p>
            </div>
            <Button asChild>
              <Link href={`/student/lessons/${data.nextLesson.id}`}>
                <Play className="h-4 w-4" />
                Học ngay
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Row 5 — Recent quiz scores sparkline */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <TrendingUp className="h-5 w-5 text-primary" />
          Điểm gần đây
        </h2>
        <RecentScoresCard scores={data.recentScores} />
      </section>
    </div>
  );
}

// =====================================================
// Stats cards — Row 2
// =====================================================

function OverallProgressCard({
  percent,
  completed,
  total,
}: {
  percent: number;
  completed: number;
  total: number;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              className="stroke-surface-2"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-foreground">{percent}%</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted">Tiến độ tổng</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {completed}/{total} bài
          </p>
          <p className="mt-0.5 text-xs text-muted">Tính trên mọi khoá đã enroll</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StreakCard({ current, longest }: { current: number; longest: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
          <Flame className="h-10 w-10" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted">Streak</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{current} ngày</p>
          <p className="mt-0.5 text-xs text-muted">Dài nhất: {longest} ngày</p>
        </div>
      </CardContent>
    </Card>
  );
}

function XpCard({ totalXP, level }: { totalXP: number; level: number }) {
  const xpInLevel = totalXP % 100;
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Trophy className="h-10 w-10" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-wider text-muted">XP</p>
            <Badge tone="info">Lvl {level}</Badge>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {totalXP.toLocaleString('vi-VN')}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${xpInLevel}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================
// Row 3 — Enrolled course card
// =====================================================

function EnrolledCourseCard({ course }: { course: DashboardPayload['enrolledCourses'][number] }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="aspect-video w-full bg-surface-2">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.thumbnailUrl}
            alt={course.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <GraduationCap className="h-8 w-8 opacity-40" />
          </div>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{course.title}</h3>
        <div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{course.progressPercent}% đã xong</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={
                'h-full rounded-full transition-all duration-500 ' +
                (course.progressPercent === 100 ? 'bg-success' : 'bg-primary')
              }
              style={{ width: `${Math.max(2, course.progressPercent)}%` }}
            />
          </div>
        </div>
        <div className="mt-auto">
          {course.nextLessonId ? (
            <Button asChild size="sm" className="w-full">
              <Link href={`/student/lessons/${course.nextLessonId}`}>
                <Play className="h-3.5 w-3.5" />
                Tiếp tục
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled className="w-full">
              Chưa có bài
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================
// Row 5 — Recent scores sparkline
// =====================================================

function RecentScoresCard({ scores }: { scores: DashboardPayload['recentScores'] }) {
  if (scores.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted">
          Chưa có bài kiểm tra nào.
        </CardContent>
      </Card>
    );
  }

  const points = scores
    .map((s) => (s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0))
    .reverse(); // oldest → newest so the line flows left to right
  const max = 100;
  const step = points.length > 1 ? 300 / (points.length - 1) : 0;
  const coords = points.map((p, i) => [i * step, 60 - (p / max) * 55] as const);
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <svg
          viewBox="0 0 300 60"
          className="h-16 w-full min-w-[200px] flex-1"
          preserveAspectRatio="none"
        >
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth="2"
          />
          {coords.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.5" className="fill-primary" />
          ))}
        </svg>
        <ul className="flex flex-1 flex-col gap-1 text-xs">
          {scores.slice(0, 5).map((s, i) => {
            const p = s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0;
            return (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-foreground">{s.lessonTitle}</span>
                <span className={p >= 70 ? 'font-semibold text-success' : 'text-muted'}>{p}%</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// =====================================================
// Loading skeleton
// =====================================================
function LoadingGrid() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-1/2 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

// =====================================================
// Motivational quote — deterministic per user so refreshes don't flicker
// =====================================================
const QUOTES = [
  'Học tập là hành trình, không phải đích đến.',
  'Mỗi bài học hôm nay là một bước tiến của ngày mai.',
  'Kỷ luật là cầu nối giữa mục tiêu và thành tựu.',
  'Kiến thức tích luỹ mỗi ngày — dù chỉ 1% cũng đáng giá.',
  'An toàn là không có tai nạn — không chỉ là luật lệ.',
  'Người giỏi không biết tất cả, họ chỉ biết cách tìm ra câu trả lời.',
];
function pickQuote(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return QUOTES[hash % QUOTES.length]!;
}
void Sparkles; // silence unused-import lint while icon stays reserved for row 6
