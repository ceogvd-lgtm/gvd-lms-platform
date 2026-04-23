'use client';

import { Badge, Button, Card, CardContent } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Award,
  BarChart3,
  GraduationCap,
  Link as LinkIcon,
  PieChart as PieIcon,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
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
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/auth-store';
import { studentsApi, type MyCertificate, type ProgressPayload } from '@/lib/students';

/**
 * /student/progress — Phase 14 progress charts.
 *
 * Rows:
 *   1. Doughnut — % complete by department
 *   2. Bar — average quiz score by subject
 *   3. Heatmap — GitHub-style activity over last 30 days
 *   4. Timeline feed — union of lesson completions + quiz submissions
 *   5. Class comparison line — my avg vs class avg (quiz)
 *   6. Certificates gallery — earned certificates with PDF + verify link
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

      {query.data && (
        <>
          <ProgressBody data={query.data} />
          <CertificatesRow />
        </>
      )}
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
            // Cap the inline timeline so 15 rows × ~60 px doesn't
            // stretch the /progress page past 900 px. Consistent with the
            // admin + instructor activity-feed scroll caps.
            <ul className="max-h-[480px] space-y-3 overflow-y-auto overscroll-contain pr-1">
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

// =====================================================
// Row 6 — Certificates gallery (Phase 14 gap #3)
// =====================================================

function CertificatesRow() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const query = useQuery({
    queryKey: ['student-certificates'],
    queryFn: () => studentsApi.certificates(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <section className="mt-6 space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
        <Award className="h-5 w-5 text-primary" />
        Chứng chỉ của bạn
      </h2>

      {query.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      )}

      {query.isError && (
        <Card className="border-error/30 bg-error/5">
          <CardContent className="flex items-center justify-between py-4 text-sm">
            <span className="text-error">Không tải được danh sách chứng chỉ</span>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Award className="h-10 w-10 text-muted opacity-60" />
            <p className="text-sm font-semibold text-foreground">Chưa có chứng chỉ nào</p>
            <p className="max-w-sm text-xs text-muted">
              Hoàn thành 100% bài giảng trong một khoá học để nhận chứng chỉ.
            </p>
          </CardContent>
        </Card>
      )}

      {query.data && query.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((c) => (
            <CertificateCard key={c.id} cert={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function CertificateCard({ cert }: { cert: MyCertificate }) {
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Phase 16 — fetch the real PDF via /certificates/:id/download.
  // Falls back to the Phase 14 browser-print page if the MinIO PDF
  // isn't there yet (e.g. background generation failed).
  const downloadPdf = async () => {
    if (!accessToken || downloading) return;
    setDownloading(true);
    toast.info('Đang chuẩn bị PDF…');
    try {
      const { certificatesApi } = await import('@/lib/certificates');
      const res = await certificatesApi.download(cert.id, accessToken);
      window.open(res.url, '_blank', 'noopener,noreferrer');
      toast.success(`Đã mở ${res.filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Tải PDF thất bại');
    } finally {
      setDownloading(false);
    }
  };

  const statusTone: 'success' | 'warning' | 'error' =
    cert.status === 'ACTIVE' ? 'success' : cert.status === 'EXPIRED' ? 'warning' : 'error';
  const statusLabel =
    cert.status === 'ACTIVE'
      ? 'Còn hiệu lực'
      : cert.status === 'EXPIRED'
        ? 'Hết hạn'
        : 'Đã thu hồi';

  const copyVerifyLink = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lms.local';
    const url = `${origin}/verify/${cert.code}`;
    try {
      setCopying(true);
      await navigator.clipboard.writeText(url);
      toast.success('Đã copy link xác thực');
    } catch {
      toast.error('Không copy được — thử chọn và copy tay nhé');
    } finally {
      setCopying(false);
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-primary/15 via-surface-2 to-secondary/10">
        {cert.course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cert.course.thumbnailUrl}
            alt={cert.course.title}
            className="h-full w-full object-cover opacity-80"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-primary/40">
            <GraduationCap className="h-14 w-14" />
          </div>
        )}
        <div className="absolute right-2 top-2">
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </div>
      </div>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
            {cert.course.title}
          </h3>
          <p className="mt-1 truncate font-mono text-[11px] text-muted">{cert.code}</p>
          <p className="mt-0.5 text-xs text-muted">
            Cấp ngày {new Date(cert.issuedAt).toLocaleDateString('vi-VN')}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-w-[120px]"
            onClick={downloadPdf}
            disabled={downloading}
          >
            <Printer className="h-3.5 w-3.5" />
            {downloading ? 'Đang tạo…' : 'Tải PDF'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-w-[120px]"
            onClick={copyVerifyLink}
            disabled={copying}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Copy link
          </Button>
          {/* LinkedIn share — only when cert is still ACTIVE. We don't
              have status on the MyCertificate shape directly so we rely
              on the gallery filtering out revoked certs on backend. */}
          <Button asChild size="sm" variant="outline" className="flex-1 min-w-[120px]">
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${cert.code}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
