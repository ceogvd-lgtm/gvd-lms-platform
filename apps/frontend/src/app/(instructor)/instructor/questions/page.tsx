'use client';

import { Button, Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, cn } from '@lms/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Edit3,
  Eye,
  FileDown,
  Filter as FilterIcon,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { DifficultyBadge } from '@/components/questions/difficulty-badge';
import { ExcelImportModal } from '@/components/questions/excel-import-modal';
import { QuestionEditorModal } from '@/components/questions/question-editor-modal';
import { QuestionPreview } from '@/components/questions/question-preview';
import { QuestionTypeBadge } from '@/components/questions/question-type-badge';
import { TagInput } from '@/components/questions/tag-input';
import { ApiError } from '@/lib/api';
import {
  type Difficulty,
  type QuestionBank,
  type QuestionType,
  questionsApi,
} from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';

const QUESTION_TYPES: Array<{ value: QuestionType | ''; label: string }> = [
  { value: '', label: 'Tất cả loại' },
  { value: 'SINGLE_CHOICE', label: '1 đáp án' },
  { value: 'MULTI_CHOICE', label: 'Nhiều đáp án' },
  { value: 'TRUE_FALSE', label: 'Đúng / Sai' },
  { value: 'FILL_BLANK', label: 'Điền vào chỗ' },
];

const DIFFICULTIES: Array<{ value: Difficulty | ''; label: string }> = [
  { value: '', label: 'Tất cả mức' },
  { value: 'EASY', label: 'Dễ' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HARD', label: 'Khó' },
];

export default function InstructorQuestionsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<QuestionType | ''>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionBank | null>(null);
  const [previewing, setPreviewing] = useState<QuestionBank | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const list = useQuery({
    queryKey: ['questions', { search, type, difficulty, tags, page }],
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

  const remove = useMutation({
    mutationFn: (id: string) => questionsApi.remove(id, accessToken!),
    onSuccess: () => {
      toast.success('Đã xoá câu hỏi');
      qc.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không thể xoá câu hỏi');
    },
  });

  const handleDelete = useCallback(
    async (q: QuestionBank) => {
      const head = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question;
      if (!confirm(`Xoá câu hỏi "${head}"?\n\nHành động không thể hoàn tác.`)) return;
      remove.mutate(q.id);
    },
    [remove],
  );

  const handleExport = useCallback(async () => {
    if (!accessToken) return;
    try {
      const { rows } = await questionsApi.exportRows(
        {
          q: search || undefined,
          type: (type || undefined) as QuestionType | undefined,
          difficulty: (difficulty || undefined) as Difficulty | undefined,
          tags: tags.length ? tags : undefined,
        },
        accessToken,
      );
      if (rows.length === 0) {
        toast.info('Không có câu hỏi nào để xuất');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'QuestionBank');
      const name = `question-bank-${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, name);
      toast.success(`Đã xuất ${rows.length} câu hỏi`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Xuất file thất bại');
    }
  }, [accessToken, search, type, difficulty, tags]);

  const data = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Ngân hàng câu hỏi</h1>
          <p className="mt-1 text-sm text-muted">
            Tạo, quản lý và nhập câu hỏi. Dùng chung cho mọi quiz. Giảng viên chỉ thấy câu hỏi mình
            tạo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport}>
            <FileDown className="h-4 w-4" />
            Xuất Excel
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            Nhập từ Excel
          </Button>
          <Button
            onClick={() => {
              setEditingQuestion(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Tạo câu hỏi
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-[1fr_200px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo nội dung câu hỏi…"
            className="h-10 w-full rounded-button border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
          />
        </div>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as QuestionType | '');
            setPage(1);
          }}
          className="h-10 rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value as Difficulty | '');
            setPage(1);
          }}
          className="h-10 rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <div className="md:col-span-3">
          <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <FilterIcon className="h-3 w-3" />
            Lọc theo tags
          </span>
          <TagInput
            tags={tags}
            onChange={(next) => {
              setTags(next);
              setPage(1);
            }}
            placeholder="Thêm thẻ để lọc…"
          />
        </div>
      </div>

      {/* List */}
      {list.isLoading ? (
        <LoadingSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          onCreate={() => setEditorOpen(true)}
          hasFilter={!!search || !!type || !!difficulty || tags.length > 0}
        />
      ) : (
        <div className="space-y-2">
          {data.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              onEdit={() => {
                setEditingQuestion(q);
                setEditorOpen(true);
              }}
              onPreview={() => setPreviewing(q)}
              onDelete={() => handleDelete(q)}
              disabled={remove.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Trang {page} / {totalPages} · {total} câu hỏi
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau →
            </Button>
          </div>
        </div>
      )}

      {/* Editor modal */}
      <QuestionEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editingQuestion}
      />

      {/* Preview modal */}
      {previewing && <PreviewDialog question={previewing} onClose={() => setPreviewing(null)} />}

      {/* Import modal */}
      <ExcelImportModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-card bg-surface-2" />
      ))}
    </div>
  );
}

function EmptyState({ onCreate, hasFilter }: { onCreate: () => void; hasFilter: boolean }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center">
      <p className="text-sm text-muted">
        {hasFilter
          ? 'Không có câu hỏi nào khớp bộ lọc.'
          : 'Chưa có câu hỏi nào — tạo câu hỏi đầu tiên để bắt đầu.'}
      </p>
      {!hasFilter && (
        <Button onClick={onCreate} className="mt-4">
          <Plus className="h-4 w-4" />
          Tạo câu hỏi đầu tiên
        </Button>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  onEdit,
  onPreview,
  onDelete,
  disabled,
}: {
  question: QuestionBank;
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  // Phase 18 — câu hỏi đang được quiz dùng không xoá được (FK restrict).
  // `usedInQuizCount` từ list API; undefined = endpoint cũ chưa update,
  // coi như 0 để không block nhầm.
  const inUseCount = question.usedInQuizCount ?? 0;
  const isInUse = inUseCount > 0;
  const deleteDisabled = disabled || isInUse;
  const deleteTooltip = isInUse ? `Gỡ câu hỏi khỏi ${inUseCount} quiz trước khi xoá` : undefined;

  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary/50">
      <div className="min-w-0 flex-1 space-y-2">
        <p className={cn('line-clamp-2 text-sm font-medium')}>{question.question}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <QuestionTypeBadge type={question.type} />
          <DifficultyBadge difficulty={question.difficulty} />
          <span>· {question.points} điểm</span>
          {/* Usage badge — xanh khi đang dùng, xám khi chưa. Giúp instructor
              biết câu nào có thể xoá được + câu nào phải gỡ khỏi quiz trước. */}
          {isInUse ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              Đang dùng trong {inUseCount} quiz
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Chưa dùng
            </span>
          )}
          {question.tags.length > 0 && (
            <span className="truncate">
              · Tags: <span className="font-semibold">{question.tags.join(', ')}</span>
            </span>
          )}
          {question.creator && (
            <span className="ml-auto">
              Tạo bởi <span className="font-semibold">{question.creator.name}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 gap-1">
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex h-8 items-center gap-1 rounded-button border border-border px-2.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          <Eye className="h-3.5 w-3.5" />
          Xem
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 items-center gap-1 rounded-button bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <Edit3 className="h-3.5 w-3.5" />
          Sửa
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteDisabled}
          title={deleteTooltip}
          // Per CLAUDE.md "disable button + tooltip giải thích (không ẩn)".
          className="inline-flex h-8 items-center gap-1 rounded-button bg-surface-2 px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2 disabled:hover:text-muted"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Xoá
        </button>
      </div>
    </div>
  );
}

function PreviewDialog({ question, onClose }: { question: QuestionBank; onClose: () => void }) {
  return (
    <Dialog
      open={true}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent maxWidth="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Xem trước (như học viên)</DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] overflow-y-auto">
          <QuestionPreview question={question} revealAnswers index={0} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
