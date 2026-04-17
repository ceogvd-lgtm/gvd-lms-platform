'use client';

import { Badge, Card, CardContent } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, PieChart as PieIcon, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAuthStore } from '@/lib/auth-store';
import { studentsApi, type ProgressPayload } from '@/lib/students';

/**
 * /student/progress — Phase 14 progress charts.
 *
 * Rows:
 *   1. Doughnut — % complete by department
 *   2. Bar — average quiz score by subject
 *   3. Heatmap — GitHub-style activity over last 30 days
 *   4. Timeline feed — union of lesson completions + quiz submissions
 *   5. Class comparison line — my avg vs class avg (quiz)
 *
 * All charts are Recharts + responsive containers so dark + light both
 * pick up the CSS variable palette.
 */
const CHART_COLORS = ['#1E40AF', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];

export default function StudentProgressPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['student-progress'],
    queryFn: () => studentsApi.progress(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tiến độ học tập</h1>
        <p className="mt-1 text-sm text-muted">Biểu đồ thống kê quá trình của bạn.</p>
      </header>

      {query.isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      )}

      {query.data && <ProgressBody data={query.data} />}
    </div>
  );
}

function ProgressBody({ data }: { data: ProgressPayload }) {
  return (
    <div className="space-y-6">
      {/* Row 1 — Doughnut: % per department */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <PieIcon className="h-4 w-4 text-primary" />
            Tỉ lệ hoàn thành theo Ngành
          </h2>
          {data.doughnutData.length === 0 ? (
            <EmptyChart msg="Chưa có dữ liệu ngành." />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                  <Pie
                    data={data.doughnutData}
                    dataKey="percent"
                    nameKey="department"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    label={(e: { department?: string; percent?: number }) =>
                      `${e.department ?? ''}: ${e.percent ?? 0}%`
                    }
                  >
                    {data.doughnutData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RPieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 2 — Bar: avg score per subject */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            Điểm trung bình theo Môn
          </h2>
          {data.barChartData.length === 0 ? (
            <EmptyChart msg="Chưa có điểm." />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.barChartData}>
                  <XAxis dataKey="subject" stroke="currentColor" className="text-xs" />
                  <YAxis stroke="currentColor" className="text-xs" domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="avgScore" fill="#1E40AF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 3 — Heatmap GitHub style */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <Activity className="h-4 w-4 text-primary" />
            Hoạt động 30 ngày
          </h2>
          <Heatmap data={data.heatmapData} />
        </CardContent>
      </Card>

      {/* Row 4 — Timeline feed */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Lịch sử học
          </h2>
          {data.timeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Chưa có hoạt động.</p>
          ) : (
            <ul className="space-y-3">
              {data.timeline.slice(0, 15).map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">{t.lessonTitle}</p>
                    <p className="text-xs text-muted">
                      {new Date(t.date).toLocaleString('vi-VN')} ·{' '}
                      {t.type === 'QUIZ'
                        ? 'Kiểm tra'
                        : t.type === 'PRACTICE'
                          ? 'Thực hành'
                          : 'Bài giảng'}
                    </p>
                  </div>
                  {t.score !== null && (
                    <Badge tone={t.score >= 70 ? 'success' : 'warning'}>{t.score}%</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Row 5 — Class comparison */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 text-base font-bold text-foreground">So sánh với lớp</h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[
                  { label: 'Của bạn', value: data.classComparison.myAvg },
                  { label: 'Trung bình lớp', value: data.classComparison.classAvg },
                ]}
              >
                <XAxis dataKey="label" stroke="currentColor" className="text-xs" />
                <YAxis stroke="currentColor" className="text-xs" domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Điểm TB"
                  stroke="#1E40AF"
                  strokeWidth={3}
                  dot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            Bạn: <b>{data.classComparison.myAvg}%</b> · Lớp: <b>{data.classComparison.classAvg}%</b>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================
// Heatmap — 30 days with GitHub-style intensity scale
// =====================================================
function Heatmap({ data }: { data: ProgressPayload['heatmapData'] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="grid grid-cols-10 gap-1 sm:grid-cols-15 md:grid-cols-30">
      {data.map((d) => {
        const intensity = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4));
        const bg =
          intensity === 0
            ? 'bg-surface-2'
            : intensity === 1
              ? 'bg-primary/25'
              : intensity === 2
                ? 'bg-primary/50'
                : intensity === 3
                  ? 'bg-primary/75'
                  : 'bg-primary';
        return (
          <div
            key={d.date}
            className={`h-6 w-6 rounded ${bg}`}
            title={`${d.date}: ${d.count} hoạt động`}
          />
        );
      })}
    </div>
  );
}

function EmptyChart({ msg }: { msg: string }) {
  return <div className="flex h-48 items-center justify-center text-sm text-muted">{msg}</div>;
}
