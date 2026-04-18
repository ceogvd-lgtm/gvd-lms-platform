'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@lms/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Award,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Send,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { CohortChart } from '@/components/analytics/cohort-chart';
import { ExportPanel } from '@/components/analytics/export-panel';
import { analyticsApi } from '@/lib/analytics';
import {
  adminReportsApi,
  ApiError,
  triggerBlobDownload,
  type ProgressReportResponse,
} from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { departmentsApi, subjectsApi } from '@/lib/curriculum';

interface FilterState {
  departmentId: string;
  subjectId: string;
  from: string;
  to: string;
}

const INITIAL_FILTER: FilterState = {
  departmentId: '',
  subjectId: '',
  from: '',
  to: '',
};

export default function AdminReportsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);
  const [preview, setPreview] = useState<ProgressReportResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  // Cached department list (rarely changes)
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list(),
    staleTime: 60 * 60 * 1000,
  });

  // Subjects are scoped to the selected department
  const subjects = useQuery({
    queryKey: ['subjects', filter.departmentId],
    queryFn: () => subjectsApi.list(filter.departmentId || undefined),
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });

  const updateFilter = (patch: Partial<FilterState>) => {
    setFilter((f) => {
      const next = { ...f, ...patch };
      // Department change invalidates subject selection
      if (patch.departmentId !== undefined && patch.departmentId !== f.departmentId) {
        next.subjectId = '';
      }
      return next;
    });
  };

  const handlePreview = async () => {
    setLoadingPreview(true);
    try {
      const data = await adminReportsApi.getProgress(
        {
          departmentId: filter.departmentId || undefined,
          subjectId: filter.subjectId || undefined,
          from: filter.from || undefined,
          to: filter.to || undefined,
        },
        accessToken!,
      );
      setPreview(data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Tải báo cáo thất bại';
      toast.error(msg);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    setExporting(format);
    try {
      const blob = await adminReportsApi.exportProgress(
        {
          format,
          departmentId: filter.departmentId || undefined,
          subjectId: filter.subjectId || undefined,
          from: filter.from || undefined,
          to: filter.to || undefined,
        },
        accessToken!,
      );
      const timestamp = new Date().toISOString().split('T')[0];
      triggerBlobDownload(blob, `progress-${timestamp}.${format}`);
      toast.success('Đã tải xuống báo cáo');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Export thất bại';
      toast.error(msg);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Báo cáo &amp; Phân tích</h1>
        <p className="mt-1 text-sm text-muted">
          Báo cáo tiến độ chi tiết + phân tích toàn hệ thống với cohort chart và lịch gửi báo cáo
          định kỳ.
        </p>
      </div>

      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">Báo cáo tiến độ</TabsTrigger>
          <TabsTrigger value="system">Phân tích hệ thống</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Bộ lọc</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label
                    htmlFor="filter-department"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Ngành
                  </label>
                  <select
                    id="filter-department"
                    value={filter.departmentId}
                    onChange={(e) => updateFilter({ departmentId: e.target.value })}
                    className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                  >
                    <option value="">Tất cả ngành</option>
                    {departments.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filter-subject"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Môn học
                  </label>
                  <select
                    id="filter-subject"
                    value={filter.subjectId}
                    onChange={(e) => updateFilter({ subjectId: e.target.value })}
                    className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                  >
                    <option value="">Tất cả môn</option>
                    {subjects.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="filter-from"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Từ ngày
                  </label>
                  <input
                    id="filter-from"
                    type="date"
                    value={filter.from}
                    onChange={(e) => updateFilter({ from: e.target.value })}
                    className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="filter-to"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Đến ngày
                  </label>
                  <input
                    id="filter-to"
                    type="date"
                    value={filter.to}
                    onChange={(e) => updateFilter({ to: e.target.value })}
                    className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handlePreview} disabled={loadingPreview}>
                  {loadingPreview ? 'Đang tải…' : 'Xem trước'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport('pdf')}
                  disabled={exporting !== null}
                >
                  <FileText className="h-4 w-4" />
                  {exporting === 'pdf' ? 'Đang xuất…' : 'Xuất PDF'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport('xlsx')}
                  disabled={exporting !== null}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {exporting === 'xlsx' ? 'Đang xuất…' : 'Xuất Excel'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilter(INITIAL_FILTER);
                    setPreview(null);
                  }}
                >
                  Đặt lại
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Xem trước — {preview.total} bản ghi
                  {preview.truncated && (
                    <span className="ml-2 rounded bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                      Đã giới hạn 1000 dòng — hãy thu hẹp bộ lọc
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {preview.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">Không có dữ liệu.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-3 py-2">Học viên</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2">Khoá học</th>
                          <th className="px-3 py-2 text-right">Tiến độ</th>
                          <th className="px-3 py-2 text-right">Điểm</th>
                          <th className="px-3 py-2">Hoàn thành</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.rows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-surface-2/50">
                            <td className="px-3 py-2">{r.studentName}</td>
                            <td className="px-3 py-2 text-xs text-muted">{r.studentEmail}</td>
                            <td className="px-3 py-2">{r.courseTitle}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {r.progressPercent}%
                            </td>
                            <td className="px-3 py-2 text-right">{r.score ?? '—'}</td>
                            <td className="px-3 py-2 text-xs">
                              {r.completedAt
                                ? new Date(r.completedAt).toLocaleDateString('vi-VN')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.rows.length > 50 && (
                      <p className="mt-3 text-center text-xs text-muted">
                        Đang hiển thị 50 dòng đầu. Export để xem đầy đủ.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <SystemAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================
// Phase 15 — "Phân tích hệ thống" tab
// =====================================================
function SystemAnalyticsTab() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const system = useQuery({
    queryKey: ['analytics-system'],
    queryFn: () => analyticsApi.system(accessToken!),
    enabled: !!accessToken,
  });

  const cohort = useQuery({
    queryKey: ['analytics-cohort'],
    queryFn: () => analyticsApi.cohort(accessToken!),
    enabled: !!accessToken,
  });

  const departments = useQuery({
    queryKey: ['departments-analytics'],
    queryFn: () => departmentsApi.list(),
    staleTime: 60 * 60 * 1000,
  });

  const [recipients, setRecipients] = useState('');
  const schedule = useMutation({
    mutationFn: () =>
      analyticsApi.scheduleReport(
        {
          recipients: recipients
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
          sendNow: false,
        },
        accessToken!,
      ),
    onSuccess: (res) => {
      toast.success(`Đã lưu ${res.subscribers.length} email nhận báo cáo định kỳ`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Lưu thất bại');
    },
  });

  const sendNow = useMutation({
    mutationFn: () =>
      analyticsApi.scheduleReport(
        {
          recipients: recipients
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
          sendNow: true,
        },
        accessToken!,
      ),
    onSuccess: (res) => {
      toast.success(
        res.sentNow
          ? `Đã quét + gửi — phát hiện ${res.sentNow.flagged} học viên nguy cơ`
          : 'Đã gửi',
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Gửi thất bại');
    },
  });

  return (
    <div className="space-y-6">
      {/* Row 1 — 4 system KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-5 w-5 text-primary" />}
          label="Học viên active 7 ngày"
          value={system.data?.activeStudentsLast7d ?? '—'}
          loading={system.isLoading}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5 text-success" />}
          label="Tỉ lệ hoàn thành"
          value={system.data ? `${system.data.completionRate}%` : '—'}
          loading={system.isLoading}
        />
        <KpiCard
          icon={<Award className="h-5 w-5 text-warning" />}
          label="Chứng chỉ đã cấp"
          value={system.data?.certificatesIssued ?? '—'}
          loading={system.isLoading}
        />
        <KpiCard
          icon={<FileText className="h-5 w-5 text-secondary" />}
          label="Điểm TB toàn hệ thống"
          value={system.data ? `${system.data.avgScore}%` : '—'}
          loading={system.isLoading}
        />
      </div>

      {/* Row 2 — Department drill-down */}
      <Card>
        <CardHeader>
          <CardTitle>Drill-down theo Ngành</CardTitle>
        </CardHeader>
        <CardContent>
          {departments.isLoading ? (
            <div className="h-32 animate-pulse rounded bg-surface-2" />
          ) : (
            <DepartmentDrilldown
              departmentIds={(departments.data ?? []).map((d: { id: string; name: string }) => ({
                id: d.id,
                name: d.name,
              }))}
            />
          )}
        </CardContent>
      </Card>

      {/* Row 3 — Cohort chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cohort — Tiến độ theo tuần</CardTitle>
        </CardHeader>
        <CardContent>
          {cohort.isLoading ? (
            <div className="h-48 animate-pulse rounded bg-surface-2" />
          ) : (
            <CohortChart points={cohort.data ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Row 4 — Scheduled report settings */}
      <Card>
        <CardHeader>
          <CardTitle>Báo cáo định kỳ hàng tuần</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label
            htmlFor="scheduled-recipients"
            className="block text-sm font-medium text-foreground"
          >
            Email nhận báo cáo (cách nhau bằng dấu phẩy)
          </label>
          <input
            id="scheduled-recipients"
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="admin1@gvd.vn, admin2@gvd.vn"
            className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => schedule.mutate()}
              disabled={!recipients.trim() || schedule.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              Lưu cài đặt
            </Button>
            <Button
              variant="outline"
              onClick={() => sendNow.mutate()}
              disabled={!recipients.trim() || sendNow.isPending}
            >
              <Send className="h-4 w-4" />
              Gửi ngay để test
            </Button>
          </div>
          <p className="text-xs text-muted">
            &quot;Gửi ngay&quot; sẽ chạy quét at-risk toàn hệ thống + gửi notification cho
            instructor + email nhắc học viên ngay lập tức (để kiểm tra pipeline).
          </p>
        </CardContent>
      </Card>

      {/* Row 5 — Export panel (full system exports) */}
      <ExportPanel />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
          <p className="text-xl font-bold text-foreground">
            {loading ? (
              <span className="inline-block h-5 w-16 animate-pulse rounded bg-surface-2" />
            ) : (
              value
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentDrilldown({
  departmentIds,
}: {
  departmentIds: Array<{ id: string; name: string }>;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [openId, setOpenId] = useState<string | null>(null);

  if (departmentIds.length === 0) {
    return <p className="py-4 text-center text-sm text-muted">Chưa có ngành nào.</p>;
  }

  return (
    <ul className="space-y-2">
      {departmentIds.map((d) => (
        <DepartmentRow
          key={d.id}
          department={d}
          open={openId === d.id}
          onToggle={() => setOpenId(openId === d.id ? null : d.id)}
          accessToken={accessToken ?? ''}
        />
      ))}
    </ul>
  );
}

function DepartmentRow({
  department,
  open,
  onToggle,
  accessToken,
}: {
  department: { id: string; name: string };
  open: boolean;
  onToggle: () => void;
  accessToken: string;
}) {
  const detail = useQuery({
    queryKey: ['analytics-dept', department.id],
    queryFn: () => analyticsApi.department(department.id, accessToken),
    enabled: open && !!accessToken,
  });

  return (
    <li className="rounded-card border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-2/40"
      >
        <span className="font-semibold text-foreground">{department.name}</span>
        <Badge tone="neutral">{open ? 'Đóng' : 'Mở'}</Badge>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {detail.isLoading ? (
            <div className="h-16 animate-pulse rounded bg-surface-2" />
          ) : detail.data ? (
            <div className="space-y-2 text-xs">
              <p className="text-sm font-semibold text-foreground">
                {detail.data.studentCount} học viên · {detail.data.courseCount} khoá · hoàn thành{' '}
                {detail.data.completionRate}% · điểm TB {detail.data.avgScore ?? '—'}%
              </p>
              <ul className="space-y-1">
                {detail.data.subjects.map((s) => (
                  <li
                    key={s.subjectId}
                    className="flex justify-between rounded bg-surface-2/30 px-2 py-1"
                  >
                    <span>{s.subjectName}</span>
                    <span className="text-muted">
                      {s.completedCount}/{s.enrolledCount} hoàn thành · {s.avgScore ?? '—'}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-error">Không tải được</p>
          )}
        </div>
      )}
    </li>
  );
}
