'use client';

import { Button, cn } from '@lms/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Filter as FilterIcon, Plus, Search, Sparkles, UploadCloud } from 'lucide-react';
import { useState } from 'react';

import { DifficultyBadge } from '@/components/questions/difficulty-badge';
import { ExcelImportModal } from '@/components/questions/excel-import-modal';
import { QuestionEditorModal } from '@/components/questions/question-editor-modal';
import { QuestionTypeBadge } from '@/components/questions/question-type-badge';
import { TagInput } from '@/components/questions/tag-input';
import {
  type Difficulty,
  type QuestionBank,
  type QuestionType,
  questionsApi,
} from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';

interface QuestionBankPickerProps {
  /** IDs already in the quiz — rendered disabled so user doesn't double-add. */
  excludeIds: Set<string>;
  onAdd: (question: QuestionBank) => void;
  onRandomPick: (params: {
    count: number;
    type?: QuestionType;
    difficulty?: Difficulty;
    tags?: string[];
  }) => void;
  disabled?: boolean;
}

/**
 * Left-hand column of the quiz builder: searchable question bank with filter
 * controls and a "random pick N" action.
 *
 * The component doesn't manage the quiz state — the parent passes `excludeIds`
 * so we can grey-out questions that are already in the quiz, and `onAdd` /
 * `onRandomPick` callbacks for mutation.
 */
export function QuestionBankPicker({
  excludeIds,
  onAdd,
  onRandomPick,
  disabled,
}: QuestionBankPickerProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [randomCount, setRandomCount] = useState<number>(5);
  const [page, setPage] = useState(1);
  // Phase 18 — instructor có thể tạo câu mới / nhập Excel ngay trong
  // quiz builder (trước đây phải điều hướng sang /instructor/questions).
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const list = useQuery({
    queryKey: ['bank-picker', { search, type, difficulty, tags, page }],
    queryFn: () =>
      questionsApi.list(
        {
          q: search || undefined,
          type: (type || undefined) as QuestionType | undefined,
          difficulty: (difficulty || undefined) as Difficulty | undefined,
          tags: tags.length ? tags : undefined,
          page,
          limit: 20,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col rounded-card border border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Ngân hàng câu hỏi</p>
          {/* Actions bar: tạo nhanh + import Excel, không cần rời trang */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="inline-flex h-7 items-center gap-1 rounded-button bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
              title="Tạo câu hỏi mới"
            >
              <Plus className="h-3 w-3" />
              Tạo
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-7 items-center gap-1 rounded-button border border-border bg-surface-2 px-2 text-[11px] font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
              title="Nhập câu hỏi từ file Excel"
            >
              <UploadCloud className="h-3 w-3" />
              Excel
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm câu hỏi…"
            className="h-9 w-full rounded-button border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as QuestionType | '');
              setPage(1);
            }}
            className="h-9 rounded-button border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            <option value="">Mọi loại</option>
            <option value="SINGLE_CHOICE">1 đáp án</option>
            <option value="MULTI_CHOICE">Nhiều đáp án</option>
            <option value="TRUE_FALSE">Đúng/Sai</option>
            <option value="FILL_BLANK">Điền chỗ</option>
          </select>
          <select
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value as Difficulty | '');
              setPage(1);
            }}
            className="h-9 rounded-button border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            <option value="">Mọi mức</option>
            <option value="EASY">Dễ</option>
            <option value="MEDIUM">Trung bình</option>
            <option value="HARD">Khó</option>
          </select>
        </div>
        <div className="mt-2">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <FilterIcon className="h-2.5 w-2.5" />
            Tags
          </span>
          <TagInput
            tags={tags}
            onChange={(next) => {
              setTags(next);
              setPage(1);
            }}
            placeholder="Lọc theo tags…"
          />
        </div>

        {/* Random pick */}
        <div className="mt-3 flex items-center gap-2 rounded-button bg-primary/5 p-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted">Bốc ngẫu nhiên</span>
          <input
            type="number"
            min={1}
            max={50}
            value={randomCount}
            onChange={(e) => setRandomCount(Math.max(1, Number(e.target.value) || 1))}
            className="h-7 w-16 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onRandomPick({
                count: randomCount,
                type: (type || undefined) as QuestionType | undefined,
                difficulty: (difficulty || undefined) as Difficulty | undefined,
                tags: tags.length ? tags : undefined,
              })
            }
            className="ml-auto"
          >
            Bốc
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-button bg-surface-2" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted">
            Không có câu hỏi nào khớp bộ lọc.
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((q) => {
              const already = excludeIds.has(q.id);
              return (
                <div
                  key={q.id}
                  draggable={!already && !disabled}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-question-id', q.id);
                  }}
                  className={cn(
                    'group flex items-start gap-2 rounded-button border border-border bg-surface p-2 text-xs transition-colors',
                    already
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-grab hover:border-primary/50 hover:bg-surface-2/60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{q.question}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                      <QuestionTypeBadge type={q.type} />
                      <DifficultyBadge difficulty={q.difficulty} />
                      <span className="text-muted">· {q.points}đ</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={already || disabled}
                    onClick={() => onAdd(q)}
                    className="inline-flex h-7 items-center gap-1 rounded-button bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                    title={already ? 'Đã thêm' : 'Thêm vào quiz'}
                  >
                    <Plus className="h-3 w-3" />
                    {already ? 'Đã thêm' : 'Thêm'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination mini */}
      {(list.data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
          <span>
            {page} / {list.data?.totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40"
            >
              ←
            </button>
            <button
              type="button"
              disabled={page >= (list.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => Math.min(list.data?.totalPages ?? 1, p + 1))}
              className="rounded px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Phase 18 — modals tái sử dụng từ /instructor/questions. Cả hai tự
          invalidate các cache 'questions' / 'admin-questions' / 'bank-picker'
          khi thành công → list picker refresh ngay trong quiz builder. */}
      <QuestionEditorModal open={editorOpen} onOpenChange={setEditorOpen} initial={null} />
      <ExcelImportModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
