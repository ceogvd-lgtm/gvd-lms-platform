'use client';

import { Button } from '@lms/ui';
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

const Document = dynamic(() => import('react-pdf').then((m) => m.Document), {
  ssr: false,
});
const Page = dynamic(() => import('react-pdf').then((m) => m.Page), { ssr: false });

interface PdfViewerProps {
  url: string;
  fileName: string;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

/**
 * Inline PDF preview — react-pdf, dynamic-imported so it ships in a
 * separate chunk and doesn't bloat the first-load bundle.
 *
 * Controls: ← / → for page nav, ZoomIn / ZoomOut buttons cycle through
 * standard presets (50, 75, 100, 125, 150%), and a Download link that
 * just hits the direct MinIO URL the backend stored.
 *
 * We intentionally don't try to remember page / zoom per-student — the
 * attachment is supplemental, and the user re-opens with 1 page / 100%.
 */
export function PdfViewer({ url, fileName }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number>(1);

  function cycleZoom(dir: 1 | -1) {
    const idx = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir));
    setZoom(ZOOM_STEPS[next]!);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            Trang {page} / {numPages || '—'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Button variant="outline" size="sm" onClick={() => cycleZoom(-1)}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => cycleZoom(1)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <a
          href={url}
          download={fileName}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border px-3 text-sm hover:border-primary hover:text-primary"
        >
          <Download className="h-4 w-4" />
          Tải về
        </a>
      </div>

      <div className="flex justify-center rounded-card border border-border bg-surface-2 p-4">
        <Document
          file={url}
          onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
          loading={<div className="py-12 text-sm text-muted">Đang tải PDF…</div>}
          error={
            <div className="py-12 text-sm text-rose-500">
              Không mở được PDF. Hãy bấm &quot;Tải về&quot; để xem ngoại tuyến.
            </div>
          }
        >
          <Page
            pageNumber={page}
            scale={zoom}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}
