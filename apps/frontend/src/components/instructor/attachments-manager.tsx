'use client';

import { cn } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError, uploadApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { attachmentsApi, type LessonAttachment } from '@/lib/theory-engine';

interface AttachmentsManagerProps {
  lessonId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * "Tài liệu đính kèm" tab — upload PDF attachments for a lesson.
 *
 * Flow:
 *   1. user picks/drops a PDF → POST /upload/attachment (Phase 06)
 *   2. returns { url, key, size, mimeType }
 *   3. we record the metadata via POST /lessons/:id/attachments (Phase 12)
 *
 * The upload endpoint already gates on MIME type (pdf only) and 50 MB
 * size limit, so we just surface its error messages.
 */
export function AttachmentsManager({ lessonId }: AttachmentsManagerProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const [dragActive, setDragActive] = useState(false);

  const listQuery = useQuery({
    queryKey: ['lesson-attachments', lessonId],
    queryFn: () => attachmentsApi.list(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadApi.attachment(file, accessToken!);
      return attachmentsApi.create(
        lessonId,
        {
          fileName: file.name,
          fileUrl: uploaded.fileUrl,
          fileSize: uploaded.fileSize,
          mimeType: uploaded.mimeType,
        },
        accessToken!,
      );
    },
    onSuccess: () => {
      toast.success('Đã thêm tài liệu');
      qc.invalidateQueries({ queryKey: ['lesson-attachments', lessonId] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Upload thất bại';
      toast.error(msg);
    },
  });

  const remove = useMutation({
    mutationFn: (att: LessonAttachment) => attachmentsApi.remove(lessonId, att.id, accessToken!),
    onSuccess: () => {
      toast.success('Đã xoá tài liệu');
      qc.invalidateQueries({ queryKey: ['lesson-attachments', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Xoá thất bại');
    },
  });

  async function handleFiles(list: FileList | File[]) {
    for (const f of Array.from(list)) {
      if (!f.type.includes('pdf')) {
        toast.error(`${f.name} không phải PDF`);
        continue;
      }
      upload.mutate(f);
    }
  }

  const items = listQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center rounded-card border-2 border-dashed py-10 text-center transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-border bg-surface-2/40',
        )}
      >
        {upload.isPending ? (
          <>
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-semibold">Đang upload PDF…</p>
          </>
        ) : (
          <>
            <UploadCloud className="mb-3 h-8 w-8 text-primary" />
            <p className="text-sm font-semibold">Kéo thả PDF vào đây</p>
            <p className="mt-1 text-xs text-muted">
              Hoặc{' '}
              <label className="cursor-pointer text-primary underline">
                chọn nhiều file
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="application/pdf"
                  onChange={(e) => {
                    const fs = e.target.files;
                    if (fs && fs.length) handleFiles(fs);
                    e.target.value = '';
                  }}
                />
              </label>
              . Tối đa 50 MB mỗi file.
            </p>
          </>
        )}
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-button bg-surface-2" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-10 text-center text-sm text-muted">
          Chưa có tài liệu nào. Học viên sẽ thấy danh sách này ở tab &quot;Tài liệu&quot;.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <FileText className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.fileName}</p>
                <p className="text-xs text-muted">
                  {formatSize(a.fileSize)} · tải lên{' '}
                  {new Date(a.createdAt).toLocaleDateString('vi-VN')}
                </p>
              </div>
              <a
                href={a.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-button border border-border px-2.5 text-xs font-semibold text-muted hover:border-primary hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" />
                Tải
              </a>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Xoá tài liệu "${a.fileName}"?`)) remove.mutate(a);
                }}
                disabled={remove.isPending}
                className="inline-flex h-8 items-center gap-1 rounded-button bg-surface-2 px-2.5 text-xs font-semibold text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xoá
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
