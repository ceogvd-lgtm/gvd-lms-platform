'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock,
  Flame,
  GraduationCap,
  Plus,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { KpiCard } from '@/components/admin/charts/kpi-card';
import { LineChartCard } from '@/components/admin/charts/line-chart-card';
import { instructorDashboardApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const STALE_TIME = 60 * 1000;

const ACTIVITY_ICON = {
  ENROLL: GraduationCap,
  COMPLETE_LESSON: TrendingUp,
  QUIZ: Award,
} as const;

const ACTIVITY_LABEL = {
  ENROLL: 'đã đăng ký',
  COMPLETE_LESSON: 'hoàn thành',
  QUIZ: 'làm bài quiz',
} as const;

export default function InstructorDashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const enabled = !!accessToken;

  const stats = useQuery({
    queryKey: ['instructor-dashboard', 'stats'],
    queryFn: () => instructorDashboardApi.getStats(accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const weekly = useQuery({
    queryKey: ['instructor-dashboard', 'weekly', 8],
    queryFn: () => instructorDashboardApi.getWeeklyProgress(8, accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const activity = useQuery({
    queryKey: ['instructor-dashboard', 'activity', 15],
    queryFn: () => instructorDashboardApi.getActivity(15, accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  const deadlines = useQuery({
    queryKey: ['instructor-dashboard', 'deadlines', 7],
    queryFn: () => instructorDashboardApi.getDeadlines(7, accessToken!),
    enabled,
    staleTime: STALE_TIME,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tổng quan giảng dạy</h1>
          <p className="mt-1 text-sm text-muted">
            Thống kê khoá học của bạn — dữ liệu được làm mới mỗi phút.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/instructor/analytics">
              <BarChart3 className="h-4 w-4" />
              Xem analytics
            </Link>
          </Button>
          <Button asChild>
            <Link href="/instructor/courses/new">
              <Plus className="h-4 w-4" />
              Tạo khoá mới
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={BookOpen}
          label="Tổng khoá học"
          value={stats.data?.totalCourses ?? 0}
          color="primary"
          loading={stats.isLoading}
        />
        <KpiCard
          icon={Users}
          label="Học viên hoạt động"
          value={stats.data?.activeStudents ?? 0}
          color="secondary"
          loading={stats.isLoading}
        />
        <KpiCard
          icon={Flame}
          label="Tỷ lệ hoàn thành"
          value={`${stats.data?.completionRate ?? 0}%`}
          color="success"
          loading={stats.isLoading}
        />
        <KpiCard
          icon={Award}
          label="Điểm TB lớp"
          value={stats.data?.avgScore ?? 0}
          color="warning"
          loading={stats.isLoading}
        />
      </div>

      {/* Weekly progress chart */}
      <LineChartCard
        title="Tiến độ học viên theo tuần"
        description="Số bài học hoàn thành mỗi tuần — 8 tuần gần nhất"
        data={
          weekly.data?.points.map((p) => ({
            label: p.week.split('-W')[1] ?? p.week,
            value: p.count,
          })) ?? []
        }
        loading={weekly.isLoading}
        valueLabel="Bài hoàn thành"
      />

      {/* Activity feed + deadlines */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Hoạt động học viên gần đây
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-surface-2" />
                ))}
              </div>
            ) : activity.data?.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Chưa có hoạt động nào.</p>
            ) : (
              // Cap the inline feed at ~6 rows so a busy instructor page
              // doesn't stretch to 1200px+ vertical. Same fix we shipped
              // for the admin ActivityFeed in v1.0.13.
              <ul className="max-h-[480px] space-y-3 overflow-y-auto overscroll-contain pr-1">
                {activity.data?.items.map((it) => {
                  const Icon = ACTIVITY_ICON[it.type];
                  return (
                    <li
                      key={it.id}
                      className="flex items-start gap-3 rounded-card border border-transparent p-2 transition-colors hover:border-border hover:bg-surface-2/40"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-semibold text-foreground">{it.studentName}</span>
                          <span className="text-muted"> {ACTIVITY_LABEL[it.type]} </span>
                          <span className="text-foreground">{it.target}</span>
                          {it.score !== null && (
                            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {it.score} điểm
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(it.timestamp).toLocaleString('vi-VN')}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Sắp hết hạn
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deadlines.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded bg-surface-2" />
                ))}
              </div>
            ) : deadlines.data?.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Không có học viên nào quá hạn.</p>
            ) : (
              <ul className="space-y-2">
                {deadlines.data?.items.map((d) => (
                  <li
                    key={d.enrollmentId}
                    className="flex items-center justify-between gap-2 rounded-card border border-amber-500/20 bg-amber-500/5 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {d.studentName}
                      </p>
                      <p className="truncate text-xs text-muted">{d.courseTitle}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {d.daysOverdue} ngày
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/instructor/analytics?filter=at-risk"
              className="mt-3 flex items-center justify-end gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Xem tất cả học viên nguy cơ
              <ChevronRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
