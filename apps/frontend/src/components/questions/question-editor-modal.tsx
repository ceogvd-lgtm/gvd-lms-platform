'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/* eslint-disable import/order -- prettier re-sorts sibling imports above the alias group; keep eslint silent rather than fight the formatter */
import { OptionEditor } from './option-editor';
import { TagInput } from './tag-input';

import { ApiError } from '@/lib/api';
import {
  type Difficulty,
  type QuestionBank,
  type QuestionOption,
  type QuestionType,
  questionsApi,
} from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';
/* eslint-enable import/order */

interface QuestionEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = create; a QuestionBank = edit */
  initial: QuestionBank | null;
  /** Defaults applied only for "create" mode. */
  defaultCourseId?: string;
  onSaved?: (q: QuestionBank) => void;
}

const DEFAULT_OPTIONS: Record<QuestionType, QuestionOption[]> = {
  SINGLE_CHOICE: [
    { id: '', text: '', isCorrect: true },
    { id: '', text: '', isCorrect: false },
    { id: '', text: '', isCorrect: false },
    { id: '', text: '', isCorrect: false },
  ],
  MULTI_CHOICE: [
    { id: '', text: '', isCorrect: true },
    { id: '', text: '', isCorrect: true },
    { id: '', text: '', isCorrect: false },
    { id: '', text: '', isCorrect: false },
  ],
  TRUE_FALSE: [
    { id: 'true', text: 'Đúng', isCorrect: true },
    { id: 'false', text: 'Sai', isCorrect: false },
  ],
  FILL_BLANK: [
    { id: '', text: '', isCorrect: true },
    { id: '', text: '', isCorrect: true },
  ],
};

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Một đáp án đúng',
  MULTI_CHOICE: 'Nhiều đáp án đúng',
  TRUE_FALSE: 'Đúng / Sai',
  FILL_BLANK: 'Điền vào chỗ trống',
};

const DIFFICULTIES: Array<{ value: Difficulty; label: string }> = [
  { value: 'EASY', label: 'Dễ' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HARD', label: 'Khó' },
];

export function QuestionEditorModal({
  open,
  onOpenChange,
  initial,
  defaultCourseId,
  onSaved,
}: QuestionEditorModalProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const [question, setQuestion] = useState('');
  const [type, setType] = useState<QuestionType>('SINGLE_CHOICE');
  const [options, setOptions] = useState<QuestionOption[]>(DEFAULT_OPTIONS.SINGLE_CHOICE);
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [tags, setTags] = useState<string[]>([]);
  const [points, setPoints] = useState<number>(1);

  // Reset form when modal opens with a different `initial`.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setQuestion(initial.question);
      setType(initial.type);
      setOptions(initial.options);
      setExplanation(initial.explanation ?? '');
      setDifficulty(initial.difficulty);
      setTags(initial.tags);
      setPoints(initial.points);
    } else {
      setQuestion('');
      setType('SINGLE_CHOICE');
      setOptions(DEFAULT_OPTIONS.SINGLE_CHOICE);
      setExplanation('');
      setDifficulty('MEDIUM');
      setTags([]);
      setPoints(1);
    }
  }, [open, initial]);

  // When type switches during create, reset options to the canonical shape.
  function onTypeChange(next: QuestionType) {
    setType(next);
    setOptions(DEFAULT_OPTIONS[next]);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        question: question.trim(),
        type,
        options,
        explanation: explanation.trim() || null,
        difficulty,
        tags,
        points,
        courseId: defaultCourseId ?? null,
        departmentId: null,
      };
      if (initial) {
        return questionsApi.update(initial.id, payload, accessToken!);
      }
      return questionsApi.create(payload, accessToken!);
    },
    onSuccess: (q) => {
      toast.success(initial ? 'Đã cập nhật câu hỏi' : 'Đã tạo câu hỏi');
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['question-tags'] });
      onSaved?.(q);
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Không thể lưu câu hỏi';
      toast.error(msg);
    },
  });

  const disabled = !question.trim() || save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Sửa câu hỏi' : 'Tạo câu hỏi mới'}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Question type selector (create only) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => (initial ? setType(t) : onTypeChange(t))}
                disabled={save.isPending}
                className={
                  'rounded-button border px-3 py-2 text-xs font-semibold transition-colors ' +
                  (type === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-muted hover:bg-surface-2')
                }
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Question stem */}
          <div>
            <label htmlFor="qe-question" className="mb-1 block text-sm font-semibold">
              Nội dung câu hỏi
            </label>
            <textarea
              id="qe-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="VD: Trong mạch xoay chiều 3 pha, thứ tự pha đúng là…"
              className="w-full rounded-button border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
            <p className="mt-1 text-xs text-muted">
              Hỗ trợ xuống dòng và ký tự toán học cơ bản. Để chèn ảnh, tải lên kho nội dung và dán
              đường dẫn Markdown `![](url)` vào vị trí mong muốn.
            </p>
          </div>

          {/* Options */}
          <div>
            <span className="mb-2 block text-sm font-semibold">Lựa chọn</span>
            <OptionEditor type={type} options={options} onChange={setOptions} />
          </div>

          {/* Explanation */}
          <div>
            <label htmlFor="qe-explanation" className="mb-1 block text-sm font-semibold">
              Giải thích <span className="text-muted">(tuỳ chọn)</span>
            </label>
            <textarea
              id="qe-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder="Hiển thị cho học viên sau khi chấm bài nếu quiz bật 'Hiện đáp án sau nộp'."
              className="w-full rounded-button border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <span className="mb-1 block text-sm font-semibold">Độ khó</span>
              <div className="flex gap-1">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDifficulty(d.value)}
                    className={
                      'flex-1 rounded-button border px-2 py-1.5 text-xs font-semibold transition-colors ' +
                      (difficulty === d.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface text-muted hover:bg-surface-2')
                    }
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="qe-points" className="mb-1 block text-sm font-semibold">
                Điểm
              </label>
              <input
                id="qe-points"
                type="number"
                min={1}
                max={100}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || 1)}
                className="w-full rounded-button border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div className="sm:col-span-1">
              <span className="mb-1 block text-sm font-semibold">Tags</span>
              <TagInput tags={tags} onChange={setTags} placeholder="Thêm thẻ…" />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Huỷ
          </Button>
          <Button onClick={() => save.mutate()} disabled={disabled}>
            <Save className="h-4 w-4" />
            {save.isPending ? 'Đang lưu…' : initial ? 'Cập nhật' : 'Tạo câu hỏi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
