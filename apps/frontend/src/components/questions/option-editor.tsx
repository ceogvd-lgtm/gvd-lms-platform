'use client';

import { Button, cn } from '@lms/ui';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

import type { QuestionOption, QuestionType } from '@/lib/assessments';

interface OptionEditorProps {
  type: QuestionType;
  options: QuestionOption[];
  onChange: (next: QuestionOption[]) => void;
  readOnly?: boolean;
}

/**
 * Editor for the option list of a question. Behaviour per type:
 *
 *  - SINGLE_CHOICE: radio-group semantics. Setting one option to correct
 *    flips all others to false.
 *  - MULTI_CHOICE:  checkbox semantics. Independent correct flags.
 *  - TRUE_FALSE:    locked two options (`Đúng` / `Sai`). Only the correct
 *    flag is editable.
 *  - FILL_BLANK:    user adds accepted answers. Each row represents one
 *    accepted text; `isCorrect` marks it as accepted (vs. shown as hint
 *    but not graded). Typically all rows are correct.
 */
export function OptionEditor({ type, options, onChange, readOnly }: OptionEditorProps) {
  const isTrueFalse = type === 'TRUE_FALSE';
  const canAdd = !isTrueFalse && options.length < (type === 'SINGLE_CHOICE' ? 6 : 10);

  function setAt(idx: number, patch: Partial<QuestionOption>) {
    const next = options.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    // Single-choice: flipping one to correct forces others false.
    if (type === 'SINGLE_CHOICE' && patch.isCorrect === true) {
      next.forEach((o, i) => (o.isCorrect = i === idx));
    }
    onChange(next);
  }

  function addOption() {
    if (!canAdd) return;
    const next: QuestionOption = {
      id: '', // server will assign on save
      text: '',
      isCorrect: false,
    };
    onChange([...options, next]);
  }

  function removeOption(idx: number) {
    if (isTrueFalse) return;
    if (options.length <= 2) return;
    onChange(options.filter((_, i) => i !== idx));
  }

  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  return (
    <div className="space-y-2">
      {options.map((opt, idx) => {
        const locked = isTrueFalse;
        return (
          <div
            key={opt.id || idx}
            className={cn(
              'flex items-start gap-2 rounded-button border border-border bg-surface p-2',
              opt.isCorrect && 'border-emerald-500/50 bg-emerald-500/5',
            )}
          >
            {!locked && (
              <span className="mt-2 text-muted" aria-hidden>
                <GripVertical className="h-4 w-4" />
              </span>
            )}

            <span className="mt-1.5 w-6 shrink-0 text-center text-sm font-semibold text-muted">
              {isTrueFalse ? (idx === 0 ? 'Đ' : 'S') : letters[idx]}
            </span>

            {/* Correct flag — radio for single, checkbox for the rest */}
            {type === 'SINGLE_CHOICE' ? (
              <input
                type="radio"
                className="mt-2 h-4 w-4 accent-emerald-600"
                checked={opt.isCorrect}
                disabled={readOnly}
                onChange={() => setAt(idx, { isCorrect: true })}
                aria-label="Đánh dấu đáp án đúng"
              />
            ) : (
              <input
                type="checkbox"
                className="mt-2 h-4 w-4 accent-emerald-600"
                checked={opt.isCorrect}
                disabled={readOnly}
                onChange={(e) => setAt(idx, { isCorrect: e.target.checked })}
                aria-label="Đáp án đúng"
              />
            )}

            {locked ? (
              <span className="mt-1 flex-1 text-sm font-medium">{idx === 0 ? 'Đúng' : 'Sai'}</span>
            ) : (
              <input
                type="text"
                value={opt.text}
                disabled={readOnly}
                onChange={(e) => setAt(idx, { text: e.target.value })}
                placeholder={
                  type === 'FILL_BLANK' ? 'Đáp án được chấp nhận…' : 'Nội dung lựa chọn…'
                }
                className="flex-1 border-0 bg-transparent px-0 py-1 text-sm outline-none placeholder:text-muted"
              />
            )}

            {!locked && !readOnly && options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="rounded p-1 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                aria-label="Xoá lựa chọn"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}

      {canAdd && !readOnly && (
        <Button variant="outline" onClick={addOption} size="sm" type="button">
          <Plus className="h-4 w-4" />
          {type === 'FILL_BLANK' ? 'Thêm đáp án chấp nhận' : 'Thêm lựa chọn'}
        </Button>
      )}

      {type === 'FILL_BLANK' && (
        <p className="text-xs text-muted">
          Chấm điểm so khớp không phân biệt hoa/thường và khoảng trắng đầu cuối.
        </p>
      )}
    </div>
  );
}
