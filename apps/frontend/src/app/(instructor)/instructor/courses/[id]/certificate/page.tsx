'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/auth-store';
import { certificateCriteriaApi, type GradeThresholds } from '@/lib/certificates';
import { chaptersApi } from '@/lib/curriculum';

interface PageProps {
  params: { id: string };
}

/**
 * Phase 16 — `/instructor/courses/:id/certificate` — editor for
 * `CertificateCriteria`. Upsert via PUT endpoint. Preview panel at the
 * bottom shows what grade a sample score would get under the current
 * thresholds, so the instructor can sanity-check before saving.
 */
export default function CertificateCriteriaPage({ params }: PageProps) {
  const courseId = params.id;
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const criteriaQ = useQuery({
    queryKey: ['cert-criteria', courseId],
    queryFn: () => certificateCriteriaApi.get(courseId, accessToken!),
    enabled: !!accessToken,
  });

  const chaptersQ = useQuery({
    queryKey: ['course-chapters-for-cert', courseId],
    queryFn: () => chaptersApi.listByCourse(courseId, accessToken!),
    enabled: !!accessToken,
  });

  // Local form state — hydrated from server once loaded
  const [form, setForm] = useState<CriteriaFormState | null>(null);

  useEffect(() => {
    if (criteriaQ.data && !form) {
      setForm({
        minPassScore: criteriaQ.data.minPassScore,
        minProgress: criteriaQ.data.minProgress,
        minPracticeScore: criteriaQ.data.minPracticeScore,
        noSafetyViolation: criteriaQ.data.noSafetyViolation,
        requiredLessons: new Set(criteriaQ.data.requiredLessons),
        validityMonths: criteriaQ.data.validityMonths,
        gradeThresholds: { ...criteriaQ.data.gradeThresholds },
      });
    }
  }, [criteriaQ.data, form]);

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('not loaded');
      return certificateCriteriaApi.upsert(
        courseId,
        {
          minPassScore: form.minPassScore,
          minProgress: form.minProgress,
          minPracticeScore: form.minPracticeScore,
          noSafetyViolation: form.noSafetyViolation,
          requiredLessons: [...form.requiredLessons],
          validityMonths: form.validityMonths,
          gradeThresholds: form.gradeThresholds,
        },
        accessToken!,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cert-criteria', courseId] });
      toast.success('Đã lưu tiêu chí cấp chứng chỉ');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Lưu thất bại');
    },
  });

  if (criteriaQ.isLoading || !form) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-96 animate-pulse rounded-card bg-surface-2" />
      </div>
    );
  }

  // chaptersApi.listByCourse returns chapters; lesson picker is built
  // from that. Shape depends on the endpoint — we read defensively to
  // avoid crashes if the frontend lib hasn't been regenerated yet.
  const lessons: Array<{ id: string; title: string; chapterTitle: string }> = [];
  for (const ch of chaptersQ.data ?? []) {
    const chapterTitle = (ch as unknown as { title: string }).title ?? '';
    const lessonList =
      (ch as unknown as { lessons?: Array<{ id: string; title: string }> }).lessons ?? [];
    for (const l of lessonList) lessons.push({ id: l.id, title: l.title, chapterTitle });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Award className="h-6 w-6 text-primary" />
          Tiêu chí cấp chứng chỉ
        </h1>
        <p className="mt-1 text-sm text-muted">
          Cài đặt điều kiện mà học viên phải đạt để nhận chứng chỉ khoá này. Các thay đổi có hiệu
          lực ngay sau khi lưu — áp dụng cho lần cấp tiếp theo, không thu hồi chứng chỉ đã cấp.
        </p>
        {!criteriaQ.data?.exists && (
          <p className="mt-2 text-xs text-muted">
            <Badge tone="neutral">Chưa cấu hình</Badge> — đang hiển thị giá trị mặc định.
          </p>
        )}
      </header>

      {/* Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Ngưỡng điểm + tiến độ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SliderField
            label="Điểm tối thiểu để pass (avg quiz)"
            value={form.minPassScore}
            onChange={(v) => setForm({ ...form, minPassScore: v })}
            min={0}
            max={100}
            suffix="%"
          />
          <SliderField
            label="Tiến độ tối thiểu của khoá (progress %)"
            value={form.minProgress}
            onChange={(v) => setForm({ ...form, minProgress: v })}
            min={0}
            max={100}
            suffix="%"
          />
          <SliderField
            label="Điểm thực hành tối thiểu"
            value={form.minPracticeScore}
            onChange={(v) => setForm({ ...form, minPracticeScore: v })}
            min={0}
            max={100}
            suffix="%"
          />
          <div className="flex items-center gap-3">
            <input
              id="noSafetyViolation"
              type="checkbox"
              checked={form.noSafetyViolation}
              onChange={(e) => setForm({ ...form, noSafetyViolation: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            <label
              htmlFor="noSafetyViolation"
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <ShieldCheck className="h-4 w-4 text-success" />
              Chặn cấp khi có vi phạm an toàn nghiêm trọng
            </label>
          </div>
          <div>
            <label
              htmlFor="validityMonths"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Thời hạn hiệu lực (tháng, bỏ trống = không thời hạn)
            </label>
            <input
              id="validityMonths"
              type="number"
              min={1}
              max={120}
              value={form.validityMonths ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  validityMonths: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="Không thời hạn"
              className="h-10 w-40 rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
            />
          </div>
        </CardContent>
      </Card>

      {/* Required lessons */}
      <Card>
        <CardHeader>
          <CardTitle>Bài học bắt buộc hoàn thành</CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted">Khoá chưa có bài giảng nào.</p>
          ) : (
            <ul className="space-y-1.5">
              {lessons.map((l) => {
                const checked = form.requiredLessons.has(l.id);
                const toggle = () => {
                  const next = new Set(form.requiredLessons);
                  if (checked) next.delete(l.id);
                  else next.add(l.id);
                  setForm({ ...form, requiredLessons: next });
                };
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={toggle}
                      className="flex w-full items-center gap-2.5 rounded-button px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        tabIndex={-1}
                        aria-label={`${l.chapterTitle} / ${l.title}`}
                        className="h-4 w-4 rounded border-border pointer-events-none"
                      />
                      <span className="truncate">
                        <span className="text-xs text-muted">{l.chapterTitle} / </span>
                        <span className="text-foreground">{l.title}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Grade thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Ngưỡng xếp loại</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SliderField
            label="Xuất sắc — điểm ≥"
            value={form.gradeThresholds.excellent}
            onChange={(v) =>
              setForm({ ...form, gradeThresholds: { ...form.gradeThresholds, excellent: v } })
            }
            min={form.gradeThresholds.good + 1}
            max={100}
            suffix="%"
            tone="warning"
          />
          <SliderField
            label="Giỏi — điểm ≥"
            value={form.gradeThresholds.good}
            onChange={(v) =>
              setForm({ ...form, gradeThresholds: { ...form.gradeThresholds, good: v } })
            }
            min={form.gradeThresholds.pass + 1}
            max={form.gradeThresholds.excellent - 1}
            suffix="%"
            tone="success"
          />
          <SliderField
            label="Đạt — điểm ≥"
            value={form.gradeThresholds.pass}
            onChange={(v) =>
              setForm({ ...form, gradeThresholds: { ...form.gradeThresholds, pass: v } })
            }
            min={0}
            max={form.gradeThresholds.good - 1}
            suffix="%"
            tone="info"
          />

          <GradePreview thresholds={form.gradeThresholds} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4" />
          Lưu tiêu chí
        </Button>
      </div>
    </div>
  );
}

// =====================================================
// Local types + subcomponents
// =====================================================

interface CriteriaFormState {
  minPassScore: number;
  minProgress: number;
  minPracticeScore: number;
  noSafetyViolation: boolean;
  requiredLessons: Set<string>;
  validityMonths: number | null;
  gradeThresholds: GradeThresholds;
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  tone?: 'warning' | 'success' | 'info';
}) {
  const valueColor =
    tone === 'warning'
      ? 'text-warning'
      : tone === 'success'
        ? 'text-success'
        : tone === 'info'
          ? 'text-primary'
          : 'text-foreground';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className={'text-sm font-bold ' + valueColor}>
          {value}
          {suffix ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function GradePreview({ thresholds }: { thresholds: GradeThresholds }) {
  const [sample, setSample] = useState(85);

  const grade =
    sample >= thresholds.excellent
      ? { label: 'Xuất sắc', color: 'text-warning' }
      : sample >= thresholds.good
        ? { label: 'Giỏi', color: 'text-success' }
        : sample >= thresholds.pass
          ? { label: 'Đạt', color: 'text-primary' }
          : { label: 'Chưa đạt', color: 'text-error' };

  return (
    <div className="rounded-card bg-surface-2/40 p-3 text-sm">
      <p className="mb-2 font-semibold text-foreground">Preview xếp loại</p>
      <div className="flex items-center gap-3">
        <label htmlFor="preview-score" className="text-xs text-muted">
          Nhập điểm:
        </label>
        <input
          id="preview-score"
          type="number"
          min={0}
          max={100}
          value={sample}
          onChange={(e) => setSample(Number(e.target.value))}
          className="h-8 w-20 rounded-button border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="text-muted">→ Xếp loại:</span>
        <span className={'text-base font-bold ' + grade.color}>{grade.label}</span>
      </div>
    </div>
  );
}
