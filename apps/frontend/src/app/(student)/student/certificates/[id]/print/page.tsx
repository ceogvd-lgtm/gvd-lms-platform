'use client';

import { Button } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { Award, Printer } from 'lucide-react';
import { use } from 'react';

import { GvdLogo } from '@/components/brand/gvd-logo';
import { useAuthStore } from '@/lib/auth-store';
import { studentsApi } from '@/lib/students';

/**
 * Print-friendly certificate page — Phase 14 gap #3.
 *
 * The student hits "Tải PDF" on the progress gallery, we open this
 * route in a new tab, and they use the browser's Ctrl+P → Save-as-PDF
 * to download the cert. We don't ship a server-side PDF generator
 * because:
 *   1. pdfmake fonts aren't wired for Vietnamese diacritics yet
 *   2. browser print gives pixel-perfect fidelity with the screen view
 *   3. downloaders can pick paper / orientation themselves
 *
 * The UI hides the "Print" button when @media print is active so the
 * printed page is just the certificate — no buttons, no header chrome.
 */
export default function CertificatePrintPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 14: unwrap the route param with React.use()
  const { id } = use(params);
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['student-certificate', id],
    queryFn: () => studentsApi.certificateDetail(id, accessToken!),
    enabled: !!accessToken,
  });

  return (
    <div className="min-h-screen bg-surface-2 px-4 py-10 print:bg-white print:p-0">
      {/* Print-only stylesheet — hide the button row + use A4 landscape.
          Uses a plain <style> tag (not styled-jsx) so we avoid pulling
          in the styled-jsx babel plugin just for this page. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4 landscape; margin: 10mm; }
              .no-print { display: none !important; }
              .cert-sheet { box-shadow: none !important; border: none !important; }
              html, body { background: white !important; }
            }
          `,
        }}
      />

      <div className="mx-auto max-w-[1000px] space-y-4">
        <div className="no-print flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">Chứng chỉ</h1>
          <Button onClick={() => window.print()} disabled={!query.data}>
            <Printer className="h-4 w-4" />
            In / Lưu PDF
          </Button>
        </div>

        {query.isLoading && <div className="h-[600px] animate-pulse rounded-card bg-surface-2" />}

        {query.isError && (
          <div className="rounded-card border border-error/30 bg-error/5 p-6 text-sm text-error">
            Không tải được chứng chỉ.
          </div>
        )}

        {query.data && (
          <div className="cert-sheet relative overflow-hidden rounded-card border-8 border-double border-primary bg-white px-16 py-12 text-slate-900 shadow-2xl">
            {/* Decorative flourishes */}
            <div className="pointer-events-none absolute left-0 top-0 h-full w-full opacity-5">
              <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-primary" />
              <div className="absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-secondary" />
            </div>

            <div className="relative space-y-6 text-center">
              <div className="flex items-center justify-center gap-3 text-primary">
                <GvdLogo className="h-12 w-12" />
                <span className="text-2xl font-bold">GVD next gen LMS</span>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm uppercase tracking-[0.2em] text-muted-foreground">
                <Award className="h-5 w-5 text-secondary" />
                <span>Certificate of Completion</span>
                <Award className="h-5 w-5 text-secondary" />
              </div>

              <p className="text-sm text-slate-500">Chứng nhận rằng</p>

              <h2 className="text-4xl font-bold tracking-tight text-primary">
                {query.data.student.name}
              </h2>

              <p className="text-sm text-slate-500">đã hoàn thành khoá học</p>

              <h3 className="text-2xl font-bold text-slate-800">{query.data.course.title}</h3>

              <div className="mx-auto grid max-w-xl grid-cols-2 gap-8 pt-8 text-sm">
                <div className="border-t-2 border-slate-400 pt-2">
                  <p className="font-semibold">
                    {query.data.instructor?.name ?? 'GVD next gen LMS'}
                  </p>
                  <p className="text-xs text-slate-500">Giảng viên</p>
                </div>
                <div className="border-t-2 border-slate-400 pt-2">
                  <p className="font-semibold">
                    {new Date(query.data.issuedAt).toLocaleDateString('vi-VN')}
                  </p>
                  <p className="text-xs text-slate-500">Ngày cấp</p>
                </div>
              </div>

              <div className="pt-6">
                <p className="text-xs text-slate-500">Mã chứng chỉ</p>
                <p className="mt-1 font-mono text-sm font-bold tracking-wider">{query.data.code}</p>
                <p className="mt-3 text-xs text-slate-500">
                  Xác thực tại: {typeof window !== 'undefined' ? window.location.origin : ''}
                  /verify/{query.data.code}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
