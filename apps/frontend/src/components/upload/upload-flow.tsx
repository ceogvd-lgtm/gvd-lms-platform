'use client';

import { Button, FileUploader, toast } from '@lms/ui';
import { useCallback, useRef, useState } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { uploadWithRetry, type UploadResult } from '@/lib/upload';

type AcceptMap = Record<string, string[]>;

interface UploadFlowProps {
  /** Backend path, e.g. "/upload/avatar" */
  endpoint: string;
  accept: AcceptMap;
  maxSize: number;
  /** Extra multipart fields — e.g. { contentType: 'WEBGL', lessonId: '…' } */
  extraFields?: Record<string, string>;
  /** Fire when backend responds with the final UploadResult. */
  onUploaded?: (result: UploadResult) => void;
  /** Label on the submit button. */
  submitLabel?: string;
}

/**
 * Composite: FileUploader (drag-drop + preview) + submit button + progress +
 * cancel + retry. Wraps `uploadWithRetry` from @/lib/upload.
 *
 * Single-file mode. Multi-file is possible but each adds its own progress row
 * — out of scope for Phase 06.
 */
export function UploadFlow({
  endpoint,
  accept,
  maxSize,
  extraFields,
  onUploaded,
  submitLabel = 'Tải lên',
}: UploadFlowProps) {
  const token = useAuthStore((s) => s.accessToken);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const file = files[0];

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    if (!token) {
      toast.error('Bạn cần đăng nhập để tải file');
      return;
    }
    setSubmitting(true);
    setResult(null);
    abortRef.current = new AbortController();
    try {
      const r = await uploadWithRetry({
        path: endpoint,
        file,
        token,
        extraFields,
        signal: abortRef.current.signal,
        onProgress: (ratio) => {
          setProgress((p) => ({ ...p, [file.name]: Math.round(ratio * 100) }));
        },
      });
      setResult(r);
      onUploaded?.(r);
      toast.success('Tải lên thành công');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        toast.info('Đã huỷ');
      } else {
        toast.error((err as Error).message || 'Tải lên thất bại');
      }
    } finally {
      setSubmitting(false);
      abortRef.current = null;
    }
  }, [file, token, endpoint, extraFields, onUploaded]);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleReset = () => {
    setFiles([]);
    setProgress({});
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <FileUploader
        files={files}
        onFilesChange={(next) => {
          setFiles(next);
          setProgress({});
          setResult(null);
        }}
        accept={accept}
        maxSize={maxSize}
        maxFiles={1}
        disabled={submitting}
        progress={progress}
      />

      {file && !result && (
        <div className="flex justify-end gap-2">
          {submitting ? (
            <Button variant="outline" onClick={handleCancel}>
              Huỷ
            </Button>
          ) : (
            <Button variant="outline" onClick={handleReset}>
              Xoá chọn
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Đang tải…' : submitLabel}
          </Button>
        </div>
      )}

      {result && (
        <div className="rounded-card bg-success/10 p-4 text-sm">
          <p className="font-semibold text-success">Tải lên thành công</p>
          <dl className="mt-2 space-y-1 text-muted">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold">Key:</dt>
              <dd className="font-mono text-xs break-all">{result.fileKey}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold">URL:</dt>
              <dd className="text-xs break-all">
                <a
                  href={result.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {result.fileUrl}
                </a>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold">Size:</dt>
              <dd>{formatBytes(result.fileSize)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-semibold">MIME:</dt>
              <dd className="font-mono text-xs">{result.mimeType}</dd>
            </div>
            {result.extractionJobId && (
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 font-semibold">Job:</dt>
                <dd className="font-mono text-xs">
                  WebGL extract #{result.extractionJobId} — đang chạy
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={handleReset}>
              Tải file khác
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
