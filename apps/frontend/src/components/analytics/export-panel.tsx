'use client';

import { Button, Card, CardContent } from '@lms/ui';
import { FileDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { analyticsApi } from '@/lib/analytics';
import { useAuthStore } from '@/lib/auth-store';

type ExportType = 'progress' | 'users' | 'certificates';
type ExportFormat = 'xlsx' | 'pdf';

interface ExportPanelProps {
  types?: ExportType[];
}

const TYPE_LABEL: Record<ExportType, string> = {
  progress: 'Tiến độ học viên',
  users: 'Danh sách người dùng',
  certificates: 'Chứng chỉ đã cấp',
};

/**
 * Phase 15 — panel for triggering Excel/PDF exports.
 *
 * Each type×format pair is a separate button so the user doesn't have
 * to juggle selects. Shows a loading spinner on the specific button
 * that's in-flight and auto-downloads the file via a synthetic
 * anchor + object URL once the response arrives.
 */
export function ExportPanel({ types = ['progress', 'users', 'certificates'] }: ExportPanelProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [busy, setBusy] = useState<string | null>(null);

  const handle = async (type: ExportType, format: ExportFormat) => {
    const key = `${type}:${format}`;
    if (busy || !accessToken) return;
    setBusy(key);
    toast.info('Đang tạo báo cáo...');
    try {
      const { blob, filename } = await analyticsApi.exportDownload(type, format, accessToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Tải xong ${filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export thất bại');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileDown className="h-4 w-4 text-primary" />
          Xuất báo cáo
        </div>
        {types.map((type) => (
          <div
            key={type}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface-2/30 p-3"
          >
            <span className="text-sm font-medium text-foreground">{TYPE_LABEL[type]}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => handle(type, 'xlsx')}
              >
                {busy === `${type}:xlsx` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => handle(type, 'pdf')}
              >
                {busy === `${type}:pdf` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                PDF
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
