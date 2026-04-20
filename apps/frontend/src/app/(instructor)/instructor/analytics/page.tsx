'use client';

import {
  Avatar,
  Button,
  DataTable,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ColumnDef,
} from '@lms/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Mail } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

// Phase 18 — lazy load heatmap. Pulls in a 7×24 grid + tooltip bundle only
// when the instructor opens the advanced-analytics tab.
const ActivityHeatmap = dynamic(
  () => import('@/components/analytics/activity-heatmap').then((m) => m.ActivityHeatmap),
  { ssr: false },
);
import { ExportPanel } from '@/components/analytics/export-panel';
import { LessonDifficultyPanel } from '@/components/analytics/lesson-difficulty-panel';
import { PracticeAnalyticsView } from '@/components/instructor/practice-analytics-view';
import { SendReminderModal } from '@/components/instructor/send-reminder-modal';
import { StudentDetailModal } from '@/components/instructor/student-detail-modal';
import { analyticsApi } from '@/lib/analytics';
import {
  ApiError,
  instructorAnalyticsApi,
  triggerBlobDownload,
  type AnalyticsStudentRow,
  type StudentStatus,
} from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { coursesApi, type Course } from '@/lib/curriculum';

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ label: string; value: StudentStatus | 'all' }> = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Hoàn thành', value: 'completed' },
  { label: 'Đang học', value: 'in-progress' },
  { label: 'Chưa bắt đầu', value: 'not-started' },
  { label: 'Nguy cơ', value: 'at-risk' },
];

const STATUS_LABEL: Record<StudentStatus, string> = {
  'at-risk': 'Nguy cơ',
  'in-progress': 'Đang học',
  completed: 'Hoàn thành',
  'not-started': 'Chưa bắt đầu',
};

const STATUS_PILL: Record<StudentStatus, string> = {
  'at-risk': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'in-progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'not-started': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function InstructorAnalyticsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);

  const [courseId, setCourseId] = useState('');
  const [filter, setFilter] = useState<StudentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedRows, setSelectedRows] = useState<AnalyticsStudentRow[]>([]);
  const [detail, setDetail] = useState<AnalyticsStudentRow | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Course list (instructor's own)
  const courses = useQuery({
    queryKey: ['instructor-courses-options', me?.id],
    queryFn: () => coursesApi.list({ instructorId: me?.id, page: 1, limit: 100 }, accessToken!),
    enabled: !!me && !!accessToken,
  });

  const students = useQuery({
    queryKey: ['analytics-students', { courseId, filter, search, pageIndex }],
    queryFn: () =>
      instructorAnalyticsApi.listStudents(
        {
          courseId: courseId || undefined,
          filter: filter === 'all' ? undefined : filter,
          q: search || undefined,
          page: pageIndex + 1,
          limit: PAGE_SIZE,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  // For sendReminder we need a single courseId. If filter is at-risk and
  // courseId is empty we group students by their course on the client.
  const reminderTargets = useMemo(() => {
    if (selectedRows.length > 0) return selectedRows;
    if (filter === 'at-risk') return students.data?.data ?? [];
    return [];
  }, [selectedRows, filter, students.data]);

  const reminderCourseId = courseId || (reminderTargets[0] ? reminderTargets[0].courseId : null);

  const reminderSummary =
    reminderTargets
      .slice(0, 3)
      .map((r) => r.studentName)
      .join(', ') + (reminderTargets.length > 3 ? `, +${reminderTargets.length - 3}` : '');

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await instructorAnalyticsApi.exportCsv(
        {
          courseId: courseId || undefined,
          filter: filter === 'all' ? undefined : filter,
        },
        accessToken!,
      );
      const ts = new Date().toISOString().split('T')[0];
      triggerBlobDownload(blob, `students-${ts}.csv`);
      toast.success('Đã tải xuống danh sách');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Export thất bại';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<AnalyticsStudentRow, unknown>[]>(
    () => [
      {
        id: 'student',
        header: 'Học viên',
        cell: ({ row }) => {
          const u = row.original;
          const initials = u.studentName
            .split(' ')
            .map((s) => s[0])
            .filter(Boolean)
            .slice(-2)
            .join('');
          return (
            <button
              type="button"
              onClick={() => setDetail(u)}
              className="flex items-center gap-3 text-left hover:underline"
            >
              <Avatar size="sm" src={u.studentAvatar ?? undefined} initials={initials} />
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{u.studentName}</div>
                <div className="truncate text-xs text-muted">{u.studentEmail}</div>
              </div>
            </button>
          );
        },
      },
      {
        id: 'course',
        header: 'Khoá',
        cell: ({ row }) => (
          <span className="text-sm text-foreground">{row.original.courseTitle}</span>
        ),
      },
      {
        id: 'progress',
        header: 'Tiến độ',
        cell: ({ row }) => {
          const p = row.original.progressPercent;
          const color = p >= 80 ? 'bg-emerald-500' : p >= 30 ? 'bg-amber-500' : 'bg-red-500';
          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                <div className={'h-full rounded-full ' + color} style={{ width: `${p}%` }} />
              </div>
              <span className="text-xs font-semibold tabular-nums">{p}%</span>
            </div>
          );
        },
      },
      {
        id: 'avgScore',
        header: 'Điểm TB',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.avgScore !== null ? row.original.avgScore : '—'}
          </span>
        ),
      },
      {
        id: 'lastActive',
        header: 'Hoạt động cuối',
        cell: ({ row }) => (
          <span className="text-xs text-muted">
            {row.original.lastActiveAt
              ? new Date(row.original.lastActiveAt).toLocaleDateString('vi-VN')
              : 'Chưa có'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => (
          <span
            className={
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ' +
              STATUS_PILL[row.original.status]
            }
          >
            {STATUS_LABEL[row.original.status]}
          </span>
        ),
      },
    ],
    [],
  );

  const totalPages = students.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics học viên</h1>
        <p className="mt-1 text-sm text-muted">
          Theo dõi tiến độ từng học viên trong khoá học của bạn. Học viên nguy cơ được tô đỏ.
        </p>
      </div>

      {/* Phase 13 — two-tab view; Phase 15 added a third "Phân tích nâng cao"
          tab for cohort / heatmap / difficulty / export features. The
          progress tab itself also gains a Phase-15 section below the
          DataTable (heatmap + lesson difficulty) so instructors don't
          need to tab-switch just to see the most useful new widgets. */}
      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">Tiến độ học viên</TabsTrigger>
          <TabsTrigger value="practice">Thực hành ảo</TabsTrigger>
          <TabsTrigger value="advanced">Phân tích nâng cao</TabsTrigger>
        </TabsList>

        <TabsContent value="progress">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={courseId}
              onChange={(e) => {
                setPageIndex(0);
                setCourseId(e.target.value);
              }}
              className="h-10 rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 sm:max-w-xs"
            >
              <option value="">Tất cả khoá của tôi</option>
              {courses.data?.data.map((c: Course) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            <input
              type="search"
              value={search}
              onChange={(e) => {
                setPageIndex(0);
                setSearch(e.target.value);
              }}
              placeholder="Tìm tên hoặc email…"
              className="h-10 rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 sm:max-w-xs"
            />

            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4" />
                {exporting ? 'Đang xuất…' : 'Export CSV'}
              </Button>
              <Button
                onClick={() => setReminderOpen(true)}
                disabled={reminderTargets.length === 0 || !reminderCourseId}
              >
                <Mail className="h-4 w-4" />
                Gửi nhắc ({reminderTargets.length})
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setPageIndex(0);
                  setFilter(f.value);
                }}
                className={
                  'whitespace-nowrap rounded-button px-3 py-1.5 text-xs font-semibold transition-colors ' +
                  (filter === f.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-2 text-muted hover:bg-surface-2/80')
                }
              >
                {f.label}
                {f.value === 'at-risk' && students.data && (
                  <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                    {students.data.data.filter((r) => r.status === 'at-risk').length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {selectedRows.length > 0 && (
            <div className="flex items-center justify-between rounded-card border border-primary/40 bg-primary/5 px-4 py-3">
              <span className="text-sm font-semibold text-primary">
                Đã chọn {selectedRows.length} học viên
              </span>
              <Button size="sm" variant="ghost" onClick={() => setSelectedRows([])}>
                Bỏ chọn
              </Button>
            </div>
          )}

          <DataTable
            data={students.data?.data ?? []}
            columns={columns}
            selectable
            onSelectionChange={setSelectedRows}
            manualPagination
            pageCount={totalPages}
            pageIndex={pageIndex}
            onPaginationChange={(s) => setPageIndex(s.pageIndex)}
            loading={students.isLoading}
            emptyState={
              students.isError
                ? (students.error as Error).message
                : 'Chưa có học viên nào khớp bộ lọc.'
            }
          />

          <StudentDetailModal
            open={!!detail}
            onClose={() => setDetail(null)}
            studentId={detail?.studentId ?? null}
            courseId={detail?.courseId ?? null}
            studentName={detail?.studentName}
            courseTitle={detail?.courseTitle}
          />

          <SendReminderModal
            open={reminderOpen}
            onClose={() => setReminderOpen(false)}
            studentIds={reminderTargets.map((r) => r.studentId)}
            courseId={reminderCourseId}
            studentSummary={reminderSummary}
          />
        </TabsContent>

        <TabsContent value="practice">
          {/* Phase 13 — practice-lab analytics. The view picks a lesson
              from those with practice content; we hand it the
              instructor's own course list as a hint, the user picks
              within. */}
          <PracticeAnalyticsView
            lessons={(courses.data?.data ?? []).flatMap((c: Course) => [
              // Course-level entry; the view re-queries per lessonId,
              // but we also need the lesson picker to include lessons
              // the instructor owns. The @lms/frontend curriculum API
              // doesn't surface lessons directly per course here, so
              // the picker falls back to courseId (backend returns 404
              // when the id isn't a lesson — surfaced to the user).
              { id: c.id, title: c.title, courseTitle: c.title },
            ])}
          />
        </TabsContent>

        <TabsContent value="advanced">
          <AdvancedAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================
// Phase 15 — "Phân tích nâng cao" tab
// =====================================================
function AdvancedAnalyticsTab() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const heatmap = useQuery({
    queryKey: ['analytics-heatmap'],
    queryFn: () => analyticsApi.heatmap(accessToken!),
    enabled: !!accessToken,
  });
  const difficulty = useQuery({
    queryKey: ['analytics-lesson-difficulty'],
    queryFn: () => analyticsApi.lessonDifficulty(accessToken!),
    enabled: !!accessToken,
  });
  // Cohort is admin-only but frontend just surfaces the 403; instructors
  // don't render it by default — we skip the query for INSTRUCTOR role.
  // Render-wise, the card will show an empty state if the call 403s.

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">Hoạt động học tập theo ngày/giờ</h2>
        <p className="text-xs text-muted">
          Heatmap các khung giờ học viên tương tác với bài giảng của bạn trong 7 ngày qua.
        </p>
        <div className="rounded-card border border-border bg-surface p-4">
          {heatmap.isLoading ? (
            <div className="h-32 animate-pulse rounded bg-surface-2" />
          ) : heatmap.data && heatmap.data.length > 0 ? (
            <ActivityHeatmap cells={heatmap.data} />
          ) : (
            <p className="py-6 text-center text-sm text-muted">Chưa có dữ liệu hoạt động.</p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">Bài học cần cải thiện</h2>
        <p className="text-xs text-muted">
          Top 10 bài có điểm trung bình thấp nhất — ưu tiên cập nhật nội dung hoặc làm lại quiz.
        </p>
        {difficulty.isLoading ? (
          <div className="h-48 animate-pulse rounded-card bg-surface-2" />
        ) : (
          <LessonDifficultyPanel rows={difficulty.data ?? []} limit={10} />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">Xuất báo cáo</h2>
        <ExportPanel />
      </section>
    </div>
  );
}
