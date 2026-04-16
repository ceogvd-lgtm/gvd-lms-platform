'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
        <h1 className="text-2xl font-bold text-foreground">Báo cáo tiến độ</h1>
        <p className="mt-1 text-sm text-muted">
          Lọc theo ngành, môn học, thời gian và xuất ra PDF hoặc Excel.
        </p>
      </div>

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
                        <td className="px-3 py-2 text-right font-semibold">{r.progressPercent}%</td>
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
    </div>
  );
}
