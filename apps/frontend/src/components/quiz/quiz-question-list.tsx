'use client';

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@lms/ui';
import { GripVertical, Trash2 } from 'lucide-react';

import { DifficultyBadge } from '@/components/questions/difficulty-badge';
import { QuestionTypeBadge } from '@/components/questions/question-type-badge';
import type { QuizQuestionRow } from '@/lib/assessments';

interface QuizQuestionListProps {
  questions: QuizQuestionRow[];
  onReorder: (orderedIds: string[]) => void;
  onRemove: (questionId: string) => void;
  /** Click a row to preview it (optional). */
  onPreview?: (q: QuizQuestionRow) => void;
  disabled?: boolean;
}

export function QuizQuestionList({
  questions,
  onReorder,
  onRemove,
  onPreview,
  disabled,
}: QuizQuestionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = questions.findIndex((q) => q.id === active.id);
    const newIdx = questions.findIndex((q) => q.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(questions, oldIdx, newIdx);
    onReorder(next.map((q) => q.id));
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface-2/40 py-16 text-center text-sm text-muted">
        Chưa có câu hỏi trong quiz.
        <p className="mt-1 text-xs">Kéo thả câu hỏi từ ngân hàng ở bên trái vào đây.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <SortableRow
              key={q.id}
              row={q}
              index={idx}
              disabled={disabled}
              onRemove={() => onRemove(q.questionId)}
              onPreview={onPreview ? () => onPreview(q) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  row,
  index,
  onRemove,
  onPreview,
  disabled,
}: {
  row: QuizQuestionRow;
  index: number;
  onRemove: () => void;
  onPreview?: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-2 rounded-card border border-border bg-surface p-3 text-sm',
        isDragging && 'z-10 shadow-lg ring-2 ring-primary/40',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Kéo để sắp xếp"
        className="mt-0.5 cursor-grab text-muted opacity-40 transition-opacity group-hover:opacity-100"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="mt-0.5 w-6 text-center text-xs font-semibold text-muted">{index + 1}</span>
      <button
        type="button"
        onClick={onPreview}
        className="min-w-0 flex-1 text-left"
        disabled={!onPreview}
      >
        <p className="line-clamp-2 font-medium">{row.question.question}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <QuestionTypeBadge type={row.question.type} />
          <DifficultyBadge difficulty={row.question.difficulty} />
          <span>· {row.points} điểm</span>
          {row.question.tags.length > 0 && (
            <span className="truncate">· {row.question.tags.join(', ')}</span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-muted opacity-60 transition-colors hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
        aria-label="Gỡ khỏi quiz"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
