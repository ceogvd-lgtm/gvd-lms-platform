'use client';

import { Button } from '@lms/ui';
import { Clock, RotateCw, Settings, Shuffle, Target, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Quiz } from '@/lib/assessments';

interface QuizSettingsPanelProps {
  quiz: Quiz;
  /** Called with the patch when the user clicks "Lưu cài đặt". */
  onSave: (patch: Partial<Quiz>) => Promise<void>;
  disabled?: boolean;
}

/**
 * Inline settings form for a quiz. Not a modal — lives on the builder page
 * because instructors flip between tweaking settings and adding questions.
 *
 * Dirty detection: compares the form state to the `quiz` prop. The "Lưu"
 * button is disabled unless something actually changed.
 */
export function QuizSettingsPanel({ quiz, onSave, disabled }: QuizSettingsPanelProps) {
  const [title, setTitle] = useState(quiz.title);
  const [timeLimitMin, setTimeLimitMin] = useState<number | ''>(
    quiz.timeLimit ? Math.round(quiz.timeLimit / 60) : '',
  );
  const [passScore, setPassScore] = useState(quiz.passScore);
  const [maxAttempts, setMaxAttempts] = useState(quiz.maxAttempts);
  const [shuffle, setShuffle] = useState(quiz.shuffleQuestions);
  const [showAnswer, setShowAnswer] = useState(quiz.showAnswerAfter);
  const [saving, setSaving] = useState(false);

  // Sync if parent fetches a fresh quiz (e.g. after refetch).
  useEffect(() => {
    setTitle(quiz.title);
    setTimeLimitMin(quiz.timeLimit ? Math.round(quiz.timeLimit / 60) : '');
    setPassScore(quiz.passScore);
    setMaxAttempts(quiz.maxAttempts);
    setShuffle(quiz.shuffleQuestions);
    setShowAnswer(quiz.showAnswerAfter);
  }, [quiz]);

  const dirty =
    title !== quiz.title ||
    (typeof timeLimitMin === 'number' ? timeLimitMin * 60 : null) !== quiz.timeLimit ||
    passScore !== quiz.passScore ||
    maxAttempts !== quiz.maxAttempts ||
    shuffle !== quiz.shuffleQuestions ||
    showAnswer !== quiz.showAnswerAfter;

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        title,
        timeLimit: timeLimitMin === '' || timeLimitMin === 0 ? null : Number(timeLimitMin) * 60,
        passScore,
        maxAttempts,
        shuffleQuestions: shuffle,
        showAnswerAfter: showAnswer,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Settings className="h-4 w-4 text-primary" />
        Cài đặt quiz
      </div>

      <div>
        <label
          htmlFor="qs-title"
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
        >
          Tiêu đề
        </label>
        <input
          id="qs-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="qs-time"
            className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            <Clock className="h-3 w-3" />
            Thời gian (phút)
          </label>
          <input
            id="qs-time"
            type="number"
            min={0}
            max={300}
            value={timeLimitMin}
            placeholder="Không giới hạn"
            onChange={(e) => setTimeLimitMin(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </div>
        <div>
          <label
            htmlFor="qs-pass"
            className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            <Target className="h-3 w-3" />
            Điểm pass (%)
          </label>
          <input
            id="qs-pass"
            type="number"
            min={0}
            max={100}
            value={passScore}
            onChange={(e) => setPassScore(Number(e.target.value))}
            className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="qs-attempts"
          className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          <RotateCw className="h-3 w-3" />
          Số lần làm lại tối đa
        </label>
        <input
          id="qs-attempts"
          type="number"
          min={1}
          max={20}
          value={maxAttempts}
          onChange={(e) => setMaxAttempts(Number(e.target.value))}
          className="h-10 w-full rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
      </div>

      <div className="space-y-2">
        <CheckboxRow
          id="qs-shuffle"
          checked={shuffle}
          onChange={setShuffle}
          title="Trộn thứ tự câu hỏi"
          description="Mỗi học viên nhận thứ tự khác nhau."
          icon={<Shuffle aria-hidden className="h-3.5 w-3.5" />}
        />
        <CheckboxRow
          id="qs-show-answer"
          checked={showAnswer}
          onChange={setShowAnswer}
          title="Hiện đáp án sau khi nộp"
          description="Hiển thị giải thích và đáp án đúng sau khi học viên nộp bài."
          icon={<Trophy aria-hidden className="h-3.5 w-3.5" />}
        />
      </div>

      <Button onClick={submit} disabled={disabled || !dirty || saving} className="w-full">
        {saving ? 'Đang lưu…' : dirty ? 'Lưu cài đặt' : 'Không có thay đổi'}
      </Button>
    </div>
  );
}

/**
 * Toggle row — split out so the parent `<label>` contains `title` as direct
 * text (needed by `jsx-a11y/label-has-associated-control`).
 */
function CheckboxRow({
  id,
  checked,
  onChange,
  title,
  description,
  icon,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 rounded-button border border-border bg-background px-3 py-2 text-sm hover:bg-surface-2"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary"
        aria-label={title}
      />
      <span className="flex-1">
        <span className="flex items-center gap-1 font-semibold">
          {icon}
          {title}
        </span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}
