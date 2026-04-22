'use client';

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, cn } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  GripVertical,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { RichTextEditor, type JSONContent } from '@/components/instructor/rich-text-editor';
import { ApiError, practiceContentsApi as phase10Api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  practiceContentsApi,
  type SafetyItemConfig,
  type ScoringConfig,
  type ScoringStepConfig,
} from '@/lib/practice';

interface PracticeContentEditorProps {
  lessonId: string;
}

/**
 * Build a fresh stepId that doesn't collide with existing ones. cuid-like
 * short string — enough to disambiguate within one lesson without
 * dragging in a dependency.
 */
function freshId(prefix: string, existing: Set<string>): string {
  let n = existing.size + 1;
  while (existing.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/**
 * The "Thực hành ảo" tab in /instructor/lessons/:id/edit.
 *
 * Three sections:
 *   1. Title + introduction (TipTap) + objectives list
 *   2. WebGL upload zone + extract-status poller
 *   3. ScoringConfigBuilder (steps + safety checklist + pass score +
 *      time limit + max attempts)
 *
 * Save goes through the Phase-10 upsert — one PracticeContent row per
 * lesson. The WebGL zip upload is a separate endpoint (Phase 13) that
 * writes `webglUrl` onto the same row under the hood.
 */
export function PracticeContentEditor({ lessonId }: PracticeContentEditorProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['practice-content', lessonId],
    queryFn: () => phase10Api.get(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  // ---------- Local form state ----------
  const [introduction, setIntroduction] = useState<JSONContent | null>(null);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [steps, setSteps] = useState<ScoringStepConfig[]>([]);
  const [safety, setSafety] = useState<SafetyItemConfig[]>([]);
  const [passScore, setPassScore] = useState(70);
  const [timeLimitMin, setTimeLimitMin] = useState<number | ''>('');
  const [maxAttempts, setMaxAttempts] = useState<number | ''>('');
  const [webglUrl, setWebglUrl] = useState('');

  // Hydrate from server data once it arrives.
  useEffect(() => {
    const pc = query.data;
    if (!pc) return;
    setWebglUrl(pc.webglUrl);
    setPassScore(pc.passScore);
    setTimeLimitMin(pc.timeLimit ? Math.round(pc.timeLimit / 60) : '');
    setMaxAttempts(pc.maxAttempts ?? '');
    setIntroduction(
      // Phase-10 PracticeContent.introduction is a string — we treat it
      // as plain text for the rich editor's initial doc.
      pc.introduction
        ? {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: pc.introduction }] }],
          }
        : null,
    );
    setObjectives(Array.isArray(pc.objectives) ? (pc.objectives as string[]) : []);
    const cfg = pc.scoringConfig as ScoringConfig | undefined;
    setSteps(cfg?.steps ?? []);
    setSafety(
      cfg?.safetyChecklist ??
        (pc.safetyChecklist as { items?: SafetyItemConfig[] } | undefined)?.items ??
        [],
    );
  }, [query.data]);

  // ---------- Persist the form ----------
  const save = useMutation({
    mutationFn: async () => {
      const plainIntro = introductionToPlainText(introduction);
      const payload = {
        introduction: plainIntro,
        objectives,
        webglUrl,
        scoringConfig: {
          steps,
          safetyChecklist: safety,
          passScore,
          timeLimit: timeLimitMin === '' ? null : Number(timeLimitMin) * 60,
        } as unknown as Record<string, unknown>,
        safetyChecklist: { items: safety } as unknown as Record<string, unknown>,
        passScore,
        timeLimit: timeLimitMin === '' ? null : Number(timeLimitMin) * 60,
        maxAttempts: maxAttempts === '' ? null : Number(maxAttempts),
      };
      return phase10Api.upsert(
        lessonId,
        payload as unknown as Parameters<typeof phase10Api.upsert>[1],
        accessToken!,
      );
    },
    onSuccess: () => {
      toast.success('Đã lưu cấu hình thực hành');
      qc.invalidateQueries({ queryKey: ['practice-content', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Lưu thất bại');
    },
  });

  // ---------- Step builder handlers ----------
  const stepIds = useMemo(() => new Set(steps.map((s) => s.stepId)), [steps]);

  const addStep = useCallback(() => {
    const id = freshId('step', stepIds);
    setSteps((cur) => [
      ...cur,
      {
        stepId: id,
        description: 'Bước mới',
        maxPoints: 10,
        isMandatory: true,
        order: cur.length + 1,
      },
    ]);
  }, [stepIds]);
  const removeStep = useCallback(
    (idx: number) => setSteps((cur) => cur.filter((_, i) => i !== idx)),
    [],
  );
  const patchStep = useCallback(
    (idx: number, patch: Partial<ScoringStepConfig>) =>
      setSteps((cur) => cur.map((s, i) => (i === idx ? { ...s, ...patch } : s))),
    [],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.stepId === active.id);
    const newIdx = steps.findIndex((s) => s.stepId === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setSteps((cur) => arrayMove(cur, oldIdx, newIdx).map((s, i) => ({ ...s, order: i + 1 })));
  };

  // ---------- Safety checklist handlers ----------
  const safetyIds = useMemo(() => new Set(safety.map((s) => s.safetyId)), [safety]);
  const addSafety = useCallback(() => {
    const id = freshId('safe', safetyIds);
    setSafety((cur) => [
      ...cur,
      { safetyId: id, description: 'Quy tắc an toàn mới', isCritical: false },
    ]);
  }, [safetyIds]);
  const removeSafety = useCallback(
    (idx: number) => setSafety((cur) => cur.filter((_, i) => i !== idx)),
    [],
  );
  const patchSafety = useCallback(
    (idx: number, patch: Partial<SafetyItemConfig>) =>
      setSafety((cur) => cur.map((s, i) => (i === idx ? { ...s, ...patch } : s))),
    [],
  );

  return (
    <div className="space-y-6">
      {/* --- 1. Intro + objectives --- */}
      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Giới thiệu bài thực hành</h3>
        <RichTextEditor
          initialContent={introduction}
          onChange={setIntroduction}
          placeholder="Mô tả mục đích, bối cảnh công việc…"
          minHeight={180}
          stickyToolbar={false}
        />
        <ObjectivesList objectives={objectives} onChange={setObjectives} />
      </section>

      {/* --- 2. WebGL upload --- */}
      <WebGLUploadPanel lessonId={lessonId} webglUrl={webglUrl} onUploaded={setWebglUrl} />

      {/* --- 3. Scoring config --- */}
      <section className="space-y-4 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Các bước thực hành (Steps)</h3>
          <Button size="sm" variant="outline" onClick={addStep}>
            <Plus className="h-4 w-4" />
            Thêm bước
          </Button>
        </div>
        {steps.length === 0 ? (
          <p className="rounded-button border border-dashed border-border py-6 text-center text-xs text-muted">
            Chưa có bước nào. Bấm &quot;Thêm bước&quot; để bắt đầu.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={steps.map((s) => s.stepId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <StepRow
                    key={step.stepId}
                    step={step}
                    index={idx}
                    onChange={(patch) => patchStep(idx, patch)}
                    onRemove={() => removeStep(idx)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Quy tắc ATVSLĐ (Safety checklist)</h3>
          <Button size="sm" variant="outline" onClick={addSafety}>
            <Plus className="h-4 w-4" />
            Thêm quy tắc
          </Button>
        </div>
        {safety.length === 0 ? (
          <p className="rounded-button border border-dashed border-border py-6 text-center text-xs text-muted">
            Chưa có quy tắc nào.
          </p>
        ) : (
          <ul className="space-y-2">
            {safety.map((item, idx) => (
              <li
                key={item.safetyId}
                className={cn(
                  'flex items-center gap-2 rounded-button border px-3 py-2',
                  item.isCritical
                    ? 'border-rose-500/40 bg-rose-500/5'
                    : 'border-border bg-surface-2/40',
                )}
              >
                <ShieldAlert
                  className={cn('h-4 w-4', item.isCritical ? 'text-rose-500' : 'text-muted')}
                />
                <input
                  type="text"
                  value={item.description ?? ''}
                  onChange={(e) => patchSafety(idx, { description: e.target.value })}
                  placeholder="VD: Phải đeo kính bảo hộ khi mài"
                  className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={item.isCritical ?? false}
                    onChange={(e) => patchSafety(idx, { isCritical: e.target.checked })}
                    className="h-4 w-4 accent-rose-500"
                  />
                  Critical
                </label>
                <button
                  type="button"
                  onClick={() => removeSafety(idx)}
                  className="rounded p-1 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                  aria-label="Xoá quy tắc"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Điều kiện chấm điểm</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="pc-pass"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Điểm pass: <span className="text-primary">{passScore}%</span>
            </label>
            <input
              id="pc-pass"
              type="range"
              min={0}
              max={100}
              step={5}
              value={passScore}
              onChange={(e) => setPassScore(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div>
            <label
              htmlFor="pc-time"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Thời gian (phút)
            </label>
            <input
              id="pc-time"
              type="number"
              min={0}
              max={600}
              value={timeLimitMin}
              placeholder="Không giới hạn"
              onChange={(e) => setTimeLimitMin(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="pc-max"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Số lần thử tối đa
            </label>
            <input
              id="pc-max"
              type="number"
              min={1}
              max={20}
              value={maxAttempts}
              placeholder="Không giới hạn"
              onChange={(e) => setMaxAttempts(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4" />
          {save.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
        </Button>
      </div>
    </div>
  );
}

// =====================================================
// Sub-components
// =====================================================

function ObjectivesList({
  objectives,
  onChange,
}: {
  objectives: string[];
  onChange: (next: string[]) => void;
}) {
  const patch = (idx: number, value: string) =>
    onChange(objectives.map((o, i) => (i === idx ? value : o)));
  const add = () => onChange([...objectives, '']);
  const remove = (idx: number) => onChange(objectives.filter((_, i) => i !== idx));
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Mục tiêu</p>
      <div className="space-y-1.5">
        {objectives.map((o, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-muted">•</span>
            <input
              type="text"
              value={o}
              onChange={(e) => patch(idx, e.target.value)}
              placeholder="VD: Vận hành đúng trình tự"
              className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="rounded p-1 text-muted hover:text-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={add} className="mt-2">
        <Plus className="h-4 w-4" />
        Thêm mục tiêu
      </Button>
    </div>
  );
}

function StepRow({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: ScoringStepConfig;
  index: number;
  onChange: (patch: Partial<ScoringStepConfig>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.stepId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-button border border-border bg-surface-2/40 p-2',
        isDragging && 'z-10 shadow-lg ring-2 ring-primary/40',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted opacity-50 hover:opacity-100"
        aria-label="Kéo để sắp xếp"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-6 text-center text-xs font-semibold text-muted">{index + 1}</span>
      <input
        type="text"
        value={step.stepId}
        onChange={(e) => onChange({ stepId: e.target.value })}
        className="h-8 w-28 rounded border border-border bg-background px-2 text-xs font-mono outline-none focus:border-primary"
        placeholder="stepId"
        title="stepId Unity dùng"
      />
      <input
        type="text"
        value={step.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Mô tả bước"
        className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm outline-none focus:border-primary"
      />
      <input
        type="number"
        min={0}
        max={100}
        value={step.maxPoints}
        onChange={(e) => onChange({ maxPoints: Number(e.target.value) || 0 })}
        className="h-8 w-16 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        title="Điểm tối đa"
      />
      <label className="inline-flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={step.isMandatory ?? true}
          onChange={(e) => onChange({ isMandatory: e.target.checked })}
          className="h-3.5 w-3.5 accent-primary"
        />
        Bắt buộc
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-muted hover:bg-rose-500/10 hover:text-rose-500"
        aria-label="Xoá bước"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WebGLUploadPanel({
  lessonId,
  webglUrl,
  onUploaded,
}: {
  lessonId: string;
  webglUrl: string;
  onUploaded: (url: string) => void;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'extracting' | 'ready' | 'failed'>(
    'idle',
  );
  const [progress, setProgress] = useState(0);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Initial status: if a webglUrl is already stored, assume READY.
  useEffect(() => {
    if (webglUrl && status === 'idle') {
      setStatus('ready');
    }
  }, [webglUrl, status]);

  // Reset mọi state về idle — user có thể thử lại sau khi lỗi mà không cần refresh trang.
  const resetForRetry = () => {
    setStatus('idle');
    setJobId(null);
    setFailReason(null);
    setProgress(0);
    setProjectName(null);
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Xoá WebGL đã upload — dùng khi instructor upload nhầm file.
  // Backend reject 400 nếu course đang PUBLISHED (chỉ INSTRUCTOR bị chặn,
  // ADMIN+ override được).
  const deleteMut = useMutation({
    mutationFn: () => practiceContentsApi.deleteWebGL(lessonId, accessToken!),
    onSuccess: (res) => {
      // Clear MinIO URL ở form cha + reset mọi state về idle
      onUploaded('');
      resetForRetry();
      toast.success(res.message);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Xoá WebGL thất bại';
      toast.error(msg);
    },
  });

  const handleDelete = () => {
    if (deleteMut.isPending) return;
    const ok = window.confirm(
      'Xoá gói WebGL khỏi bài giảng này?\n\n' +
        'Toàn bộ file Unity (index.html, loader.js, data, wasm...) sẽ bị xoá khỏi MinIO. ' +
        'Sau khi xoá, bạn có thể upload lại file khác.\n\n' +
        'LƯU Ý: Nếu khoá học đã PUBLISHED, backend sẽ từ chối — huỷ xuất bản trước khi xoá.',
    );
    if (ok) deleteMut.mutate();
  };

  const upload = useMutation({
    mutationFn: (file: File) => practiceContentsApi.uploadWebGL(lessonId, file, accessToken!),
    onMutate: () => {
      // Reset TẤT CẢ state liên quan upload cũ — tránh stale jobId gây polling zombie
      // khi user upload lại sau lần fail trước.
      setStatus('uploading');
      setJobId(null);
      setFailReason(null);
      setProgress(0);
    },
    onSuccess: (res) => {
      setJobId(res.jobId);
      setProjectName(res.projectName);
      setStatus('extracting');
      onUploaded(res.predictedUrl);
      toast.success(
        res.projectName
          ? `Đã nhận gói "${res.projectName}", đang giải nén…`
          : 'Đã nhận gói WebGL, đang giải nén…',
      );
    },
    onError: (err) => {
      // Upload thất bại — không có job nào được tạo, clear jobId để tránh polling stale.
      setStatus('failed');
      setJobId(null);
      const msg = err instanceof ApiError ? err.message : 'Upload thất bại';
      setFailReason(msg);
      toast.error(msg);
    },
  });

  // Poll extract status every 2 s while a job is in-flight.
  useEffect(() => {
    if (!jobId || status !== 'extracting' || !accessToken) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await practiceContentsApi.extractStatus(lessonId, jobId, accessToken);
        if (cancelled) return;
        setProgress(s.progress);
        if (s.state === 'completed') {
          setStatus('ready');
          setJobId(null); // clear — job đã xong, không cần poll nữa
          toast.success('Giải nén thành công — WebGL sẵn sàng');
        } else if (s.state === 'failed') {
          // CRITICAL: clear jobId để useEffect cleanup chạy và interval dừng
          // ngay lập tức. Nếu không clear, interval vẫn chạy 2s/lần dù status='failed'.
          setStatus('failed');
          setJobId(null);
          setFailReason(s.failReason ?? 'Giải nén thất bại');
          toast.error(s.failReason ?? 'Giải nén thất bại');
        }
      } catch (err) {
        // Network error khi poll — không fatal, thử lại tick sau. Log để debug.
        // eslint-disable-next-line no-console
        console.warn('[extractStatus poll]', err);
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 2_000);
    return () => {
      cancelled = true;
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, status, lessonId, accessToken]);

  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">Gói Unity WebGL</h3>

      {status !== 'ready' && status !== 'extracting' && (
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
            if (f) upload.mutate(f);
          }}
          className={cn(
            'flex flex-col items-center justify-center rounded-card border-2 border-dashed py-10 text-center transition-colors',
            dragActive ? 'border-primary bg-primary/5' : 'border-border bg-surface-2/40',
            status === 'failed' && 'border-rose-400 bg-rose-500/5',
          )}
        >
          {status === 'uploading' ? (
            <>
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-semibold">Đang upload…</p>
            </>
          ) : status === 'failed' ? (
            <>
              <AlertTriangle className="mb-3 h-8 w-8 text-rose-500" />
              <p className="text-sm font-semibold text-rose-600">Upload thất bại</p>
              {failReason && <p className="mt-1 max-w-md text-xs text-muted">{failReason}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={resetForRetry}
                  className="inline-flex items-center gap-1.5 rounded-button bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  Thử lại
                </button>
                {/* key trick: force re-mount input để browser reset value, cho phép chọn lại CÙNG file */}
                <label className="cursor-pointer rounded-button border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-2 transition-colors">
                  Chọn file khác
                  <input
                    key={`retry-${jobId ?? 'empty'}`}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload.mutate(f);
                      // clear input value để lần sau chọn lại cùng file vẫn trigger onChange
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <CloudUpload className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm font-semibold">Kéo thả file .zip Unity WebGL</p>
              <p className="mt-1 text-xs text-muted">
                Hoặc{' '}
                <label className="cursor-pointer text-primary underline">
                  chọn file
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload.mutate(f);
                      // clear value → cho phép upload lại cùng file sau khi fail
                      e.target.value = '';
                    }}
                  />
                </label>
                . Cần có <code>index.html</code> + <code>Builds.loader.js</code>.
              </p>
            </>
          )}
        </div>
      )}

      {status === 'extracting' && (
        <div className="rounded-card border border-primary/40 bg-primary/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang giải nén {projectName ? `"${projectName}"` : 'WebGL'}… {progress}%
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {status === 'ready' && webglUrl && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-button border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span className="flex-1 font-semibold text-emerald-700 dark:text-emerald-400">
              WebGL sẵn sàng {projectName && `— gói "${projectName}"`}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus('idle')}
              disabled={deleteMut.isPending}
              title="Giữ nguyên file cũ, chỉ reset UI để upload đè"
            >
              Tải lại
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="border-rose-400 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              title="Xoá hoàn toàn file Unity khỏi MinIO"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteMut.isPending ? 'Đang xoá…' : 'Xoá'}
            </Button>
          </div>
          <p className="text-xs text-muted">Xem trước (400×300):</p>
          <iframe
            src={webglUrl}
            title="WebGL preview"
            className="block h-[300px] w-[400px] rounded border border-border"
            sandbox="allow-same-origin allow-scripts allow-popups"
          />
        </div>
      )}
    </section>
  );
}

/**
 * Convert a TipTap doc back to plain text for storage in
 * PracticeContent.introduction (Phase 10 stores it as String, not JSON).
 * We join paragraphs with "\n\n" so formatting survives for a later UI
 * that renders Markdown / TipTap from the same field.
 */
function introductionToPlainText(doc: JSONContent | null): string {
  if (!doc?.content) return '';
  const paragraphs: string[] = [];
  for (const node of doc.content) {
    if (node.type === 'paragraph' && Array.isArray(node.content)) {
      const line = node.content
        .map((n: { type?: string; text?: string }) => (n.type === 'text' ? (n.text ?? '') : ''))
        .join('');
      paragraphs.push(line);
    }
  }
  return paragraphs.join('\n\n').trim();
}
