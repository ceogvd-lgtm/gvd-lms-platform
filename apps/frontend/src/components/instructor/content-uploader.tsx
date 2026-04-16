'use client';

import { Button, cn } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CloudUpload,
  FileText,
  Film,
  Loader2,
  PackageOpen,
  Presentation,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError, theoryContentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  type ContentKind,
  type ScormUploadResult,
  type SlideDeck,
  scormApi,
  theoryEngineApi,
} from '@/lib/theory-engine';

interface ContentUploaderProps {
  lessonId: string;
}

type Status = 'idle' | 'uploading' | 'converting' | 'success' | 'error';

interface KindMeta {
  value: ContentKind;
  label: string;
  icon: typeof CloudUpload;
  accept: string;
  hint: string;
}

const KINDS: KindMeta[] = [
  {
    value: 'SCORM',
    label: 'SCORM',
    icon: PackageOpen,
    accept: '.zip',
    hint: 'Gói .zip chứa imsmanifest.xml — hỗ trợ SCORM 1.2 và 2004.',
  },
  {
    value: 'XAPI',
    label: 'xAPI (Tin Can)',
    icon: PackageOpen,
    accept: '.zip',
    hint: 'Gói .zip Tin Can — phát hiện qua tincan.xml hoặc activity-id.',
  },
  {
    value: 'VIDEO',
    label: 'Video',
    icon: Film,
    accept: 'video/mp4,video/webm',
    hint: 'MP4 / WebM. Thanh tiến độ xem và điểm hoàn thành theo ngưỡng.',
  },
  {
    value: 'POWERPOINT',
    label: 'PowerPoint',
    icon: Presentation,
    accept: '.pptx',
    hint: '.pptx. Hệ thống sẽ render từng slide thành ảnh PNG qua LibreOffice.',
  },
];

/**
 * "Nội dung chính" tab — lets the instructor pick ONE content type per
 * lesson and upload the file. Under the hood:
 *
 *   SCORM/xAPI:  POST /scorm/upload/:lessonId   (backend unzips + parses manifest)
 *   VIDEO:       POST /lessons/:id/theory/upload with kind=VIDEO
 *   POWERPOINT:  POST /lessons/:id/theory/upload with kind=POWERPOINT
 *                then POST /convert-ppt to rasterise slides
 *
 * On success the TheoryContent row is updated with the right contentType
 * + contentUrl (the student player reads this on load).
 *
 * Completion threshold slider (50-100, default 80) writes back through
 * the existing PUT /lessons/:id/theory upsert — same record, different
 * field.
 */
export function ContentUploader({ lessonId }: ContentUploaderProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const theoryQuery = useQuery({
    queryKey: ['theory', lessonId],
    queryFn: () => theoryContentsApi.get(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const [kind, setKind] = useState<ContentKind>('VIDEO');
  const [status, setStatus] = useState<Status>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [slidePreview, setSlidePreview] = useState<SlideDeck | null>(null);
  const [scormInfo, setScormInfo] = useState<ScormUploadResult | null>(null);
  const [threshold, setThreshold] = useState<number>(
    Math.round((theoryQuery.data?.completionThreshold ?? 0.8) * 100),
  );

  // Sync threshold input when the fetch completes.
  const currentContent = theoryQuery.data;
  if (
    currentContent &&
    Math.round(currentContent.completionThreshold * 100) !== threshold &&
    status === 'idle'
  ) {
    setThreshold(Math.round(currentContent.completionThreshold * 100));
  }

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setStatus('uploading');
      setScormInfo(null);
      setSlidePreview(null);

      if (kind === 'SCORM' || kind === 'XAPI') {
        // Backend unzips + reads imsmanifest; returns version + entry URL.
        const info = await scormApi.upload(lessonId, file, accessToken!);
        setScormInfo(info);
        setStatus('success');
        return info;
      }

      if (kind === 'VIDEO') {
        const res = await theoryEngineApi.uploadContent(lessonId, 'VIDEO', file, accessToken!);
        setStatus('success');
        return res;
      }

      // POWERPOINT — upload then convert
      const res = await theoryEngineApi.uploadContent(lessonId, 'POWERPOINT', file, accessToken!);
      setStatus('converting');
      const deck = await theoryEngineApi.convertPpt(lessonId, res.fileKey, accessToken!);
      setSlidePreview(deck);
      setStatus('success');
      return deck;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['theory', lessonId] });
      toast.success('Đã tải lên nội dung');
    },
    onError: (err) => {
      setStatus('error');
      const msg = err instanceof ApiError ? err.message : 'Upload thất bại';
      toast.error(msg);
    },
  });

  const thresholdMutation = useMutation({
    mutationFn: async (pct: number) => {
      if (!currentContent) throw new Error('Chưa có nội dung để điều chỉnh ngưỡng');
      return theoryContentsApi.upsert(
        lessonId,
        {
          overview: currentContent.overview,
          objectives: currentContent.objectives as unknown[],
          contentType: currentContent.contentType,
          contentUrl: currentContent.contentUrl,
          duration: currentContent.duration,
          completionThreshold: pct / 100,
          body: currentContent.body as Record<string, unknown> | undefined,
        },
        accessToken!,
      );
    },
    onSuccess: () => {
      toast.success(`Đã cập nhật ngưỡng hoàn thành ${threshold}%`);
      qc.invalidateQueries({ queryKey: ['theory', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Cập nhật thất bại');
    },
  });

  const pickedMeta = KINDS.find((k) => k.value === kind) ?? KINDS[0]!;

  return (
    <div className="space-y-6">
      {/* Type picker */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Loại nội dung</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const active = kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-card border-2 bg-surface p-4 text-sm transition-colors',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted hover:border-primary/50',
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="font-semibold">{k.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">{pickedMeta.hint}</p>
      </section>

      {/* Drop zone */}
      <section>
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
            const f = e.dataTransfer.files?.[0];
            if (f) uploadMutation.mutate(f);
          }}
          className={cn(
            'flex flex-col items-center justify-center rounded-card border-2 border-dashed py-12 text-center transition-colors',
            status === 'error' && 'border-rose-400 bg-rose-500/5',
            dragActive && status === 'idle' && 'border-primary bg-primary/5',
            status === 'idle' &&
              !dragActive &&
              'border-border bg-surface-2/40 hover:border-primary/50',
            (status === 'uploading' || status === 'converting') && 'border-primary/70 bg-primary/5',
            status === 'success' && 'border-emerald-500/60 bg-emerald-500/5',
          )}
        >
          {status === 'uploading' && (
            <>
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-semibold">Đang tải lên…</p>
            </>
          )}
          {status === 'converting' && (
            <>
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-semibold">Đang convert PowerPoint → slides…</p>
              <p className="mt-1 text-xs text-muted">Việc convert mất vài giây. Đừng đóng tab.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
              <p className="text-sm font-semibold">Đã upload thành công</p>
            </>
          )}
          {status === 'error' && (
            <>
              <p className="text-sm font-semibold text-rose-600">Upload thất bại</p>
              <p className="mt-1 text-xs text-muted">Kiểm tra lại định dạng và thử lại.</p>
            </>
          )}
          {status === 'idle' && (
            <>
              <CloudUpload className="mb-3 h-10 w-10 text-primary" />
              <p className="text-sm font-semibold">Kéo thả {pickedMeta.label} vào đây</p>
              <p className="mt-1 text-xs text-muted">
                Hoặc{' '}
                <label className="cursor-pointer text-primary underline">
                  chọn file
                  <input
                    type="file"
                    className="hidden"
                    accept={pickedMeta.accept}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadMutation.mutate(f);
                    }}
                  />
                </label>
              </p>
            </>
          )}
        </div>

        {/* Post-upload details */}
        {scormInfo && (
          <div className="mt-3 rounded-button border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
            <p className="font-semibold">
              Phát hiện {scormInfo.version === '1.2' ? 'SCORM 1.2' : 'SCORM 2004'} —{' '}
              {scormInfo.title}
            </p>
            <p className="mt-1 text-xs text-muted">
              Entry point: <code>{scormInfo.entryPoint}</code> · {scormInfo.itemCount} items
            </p>
          </div>
        )}
        {slidePreview && (
          <div className="mt-3 rounded-button border border-border bg-surface p-3 text-sm">
            {slidePreview.converter === 'libreoffice' ? (
              <>
                <p className="font-semibold">
                  Đã render {slidePreview.total} slides qua LibreOffice.
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {slidePreview.slides.slice(0, 3).map((s) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={s.index}
                      src={s.imageUrl}
                      alt={`Slide ${s.index}`}
                      className="aspect-video w-full rounded border border-border bg-surface-2 object-contain"
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">{slidePreview.message}</p>
            )}
          </div>
        )}
      </section>

      {/* Threshold slider */}
      <section>
        <div className="flex items-center justify-between">
          <label htmlFor="threshold" className="text-sm font-semibold">
            Ngưỡng hoàn thành: <span className="text-primary">{threshold}%</span>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!currentContent || thresholdMutation.isPending}
            onClick={() => thresholdMutation.mutate(threshold)}
          >
            {thresholdMutation.isPending ? 'Đang lưu…' : 'Lưu ngưỡng'}
          </Button>
        </div>
        <input
          id="threshold"
          type="range"
          min={50}
          max={100}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="mt-2 w-full accent-primary"
        />
        <p className="mt-1 text-xs text-muted">
          Học viên phải xem / hoàn thành ít nhất {threshold}% nội dung để lesson được ghi nhận.
        </p>
      </section>

      {/* Current content summary */}
      {currentContent?.contentUrl && (
        <section className="rounded-card border border-border bg-surface p-4 text-sm">
          <h4 className="mb-2 flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4" />
            Nội dung hiện tại
          </h4>
          <p className="text-xs text-muted">
            Loại: <strong>{currentContent.contentType}</strong>
            {currentContent.duration && <> · {currentContent.duration}s</>} · ngưỡng{' '}
            {Math.round(currentContent.completionThreshold * 100)}%
          </p>
        </section>
      )}
    </div>
  );
}
