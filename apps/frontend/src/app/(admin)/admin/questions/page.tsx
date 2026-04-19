'use client';

/**
 * Admin Question Bank page (Phase 18).
 *
 * Chuyên biệt cho Admin/Super-Admin — thấy toàn bộ câu hỏi của mọi
 * instructor, filter theo giảng viên + độ khó + tìm kiếm nội dung, và
 * xoá hàng loạt với safety check (chỉ chọn được câu "Chưa dùng").
 *
 * KHÔNG ảnh hưởng `/instructor/questions` — backend + frontend tách hoàn
 * toàn. Xoá 1 câu tái sử dụng `questionsApi.remove()` (endpoint cũ,
 * admin đã có quyền bypass ownership). Xoá hàng loạt dùng endpoint mới
 * `DELETE /admin/questions/bulk`.
 */
import { Button } from '@lms/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Search, Trash2, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DifficultyBadge } from '@/components/questions/difficulty-badge';
import { ExcelImportModal } from '@/components/questions/excel-import-modal';
import { adminQuestionsApi } from '@/lib/admin-questions';
import { adminApi, ApiError } from '@/lib/api';
import { type Difficulty, type QuestionBank, questionsApi } from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';

const PAGE_SIZE = 20;

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty | ''; label: string }> = [
  { value: '', label: 'Tất cả mức' },
  { value: 'EASY', label: 'Dễ' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HARD', label: 'Khó' },
];

export default function AdminQuestionsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  // ---------- Filter state ----------
  const [search, setSearch] = useState('');
  const [instructorId, setInstructorId] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [page, setPage] = useState(1);

  // ---------- Modal state ----------
  const [importOpen, setImportOpen] = useState(false);

  // ---------- Selection ----------
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection khi filter đổi — tránh state rác giữa 2 page.
  useEffect(() => {
    setSelected(new Set());
  }, [search, instructorId, difficulty, page]);

  // ---------- Queries ----------
  const listQuery = useQuery({
    queryKey: ['admin-questions', { search, instructorId, difficulty, page }],
    queryFn: () =>
      adminQuestionsApi.list(
        {
          q: search || undefined,
          instructorId: instructorId || undefined,
          difficulty: (difficulty || undefined) as Difficulty | undefined,
          page,
          limit: PAGE_SIZE,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  // Lấy danh sách giảng viên cho dropdown — chỉ 1 lần, cache forever.
  const instructorsQuery = useQuery({
    queryKey: ['admin-users-instructors'],
    queryFn: () => adminApi.listUsers({ role: 'INSTRUCTOR', limit: 100 }, accessToken!),
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  });

  // ---------- Mutations ----------
  const removeOne = useMutation({
    mutationFn: (id: string) => questionsApi.remove(id, accessToken!),
    onSuccess: () => {
      toast.success('Đã xoá câu hỏi');
      qc.invalidateQueries({ queryKey: ['admin-questions'] });
      // Đồng bộ cả instructor cache — câu vừa xoá lẽ ra biến mất ở cả 2 view.
      qc.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Không thể xoá câu hỏi');
    },
  });

  const bulkRemove = useMutation({
    mutationFn: (ids: string[]) => adminQuestionsApi.bulkDelete(ids, accessToken!),
    onSuccess: (result) => {
      const parts = [`Đã xoá ${result.deleted} câu hỏi`];
      if (result.skipped > 0) parts.push(`(bỏ qua ${result.skipped} câu đang dùng)`);
      toast.success(parts.join(' '));
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin-questions'] });
      qc.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Xoá hàng loạt thất bại');
    },
  });

  // ---------- Handlers ----------
  const handleReset = () => {
    setSearch('');
    setInstructorId('');
    setDifficulty('');
    setPage(1);
  };

  const handleToggle = useCallback(
    (id: string, isInUse: boolean) => {
      if (isInUse) return; // defense-in-depth: không cho select câu đang dùng
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setSelected],
  );

  const handleDeleteOne = useCallback(
    (q: QuestionBank) => {
      const head = q.question.length > 60 ? q.question.slice(0, 60) + '…' : q.question;
      if (!confirm(`Xoá câu hỏi "${head}"?\n\nHành động không thể hoàn tác.`)) return;
      removeOne.mutate(q.id);
    },
    [removeOne],
  );

  const handleBulkDelete = () => {
    const count = selected.size;
    if (count === 0) return;
    if (!confirm(`Xoá ${count} câu hỏi đã chọn?\n\nHành động này không thể hoàn tác.`)) {
      return;
    }
    bulkRemove.mutate([...selected]);
  };

  // Memo rows riêng để useMemo(selectableIds) không re-compute mỗi render.
  // Nếu để `listQuery.data?.data ?? []` trực tiếp thì mỗi render tạo mảng
  // mới → selectableIds luôn invalidate.
  const rows = useMemo<QuestionBank[]>(() => listQuery.data?.data ?? [], [listQuery.data]);
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const startIndex = (page - 1) * PAGE_SIZE;

  const selectableIds = useMemo(
    () => rows.filter((r) => (r.usedInQuizCount ?? 0) === 0).map((r) => r.id),
    [rows],
  );
  const allSelectableChecked =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAllSelectable = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectableChecked) {
        selectableIds.forEach((id) => next.delete(id));
      } else {
        selectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const instructors = instructorsQuery.data?.data ?? [];
  const isFiltered = !!search || !!instructorId || !!difficulty;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Ngân hàng câu hỏi</h1>
            {!listQuery.isLoading && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-primary">
                {total} câu
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Quản lý toàn bộ câu hỏi của mọi giảng viên. Chỉ xoá được câu{' '}
            <span className="font-semibold">Chưa dùng</span> để tránh phá vỡ quiz đang chạy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Phase 18 — admin cũng dùng chung ExcelImportModal với instructor.
              Modal có sẵn nút "Tải template mẫu" + parser SheetJS client-side
              + dry-run preview; POST /questions/import là endpoint dùng chung
              (ADMIN+ → câu tạo ra có createdBy = admin). */}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <UploadCloud className="h-4 w-4" />
            Nhập từ Excel
          </Button>
        </div>
      </div>

      {/* Row 1 — Filter bar */}
      <div className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-[1fr_220px_180px_auto]">
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
          value={instructorId}
          onChange={(e) => {
            setInstructorId(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          aria-label="Lọc theo giảng viên"
        >
          <option value="">Tất cả giảng viên</option>
          {instructors.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
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
          aria-label="Lọc theo độ khó"
        >
          {DIFFICULTY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={!isFiltered}
          className="h-10"
          aria-label="Reset bộ lọc"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      {/* Row 3 — Bulk action bar (hiện khi có chọn) */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-rose-500/30 bg-rose-500/5 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Đã chọn <span className="font-bold text-rose-600">{selected.size}</span> câu
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
            <Button
              onClick={handleBulkDelete}
              disabled={bulkRemove.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              size="sm"
            >
              <Trash2 className="h-4 w-4" />
              Xoá {selected.size} câu đã chọn
            </Button>
          </div>
        </div>
      )}

      {/* Row 2 — Bảng câu hỏi */}
      {listQuery.isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState hasFilter={isFiltered} onReset={handleReset} />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary"
                      checked={allSelectableChecked}
                      disabled={selectableIds.length === 0}
                      onChange={toggleAllSelectable}
                      aria-label="Chọn tất cả câu chưa dùng"
                    />
                  </th>
                  <th className="w-12 px-3 py-3 text-left">STT</th>
                  <th className="px-3 py-3 text-left">Nội dung</th>
                  <th className="w-56 px-3 py-3 text-left">Giảng viên</th>
                  <th className="w-28 px-3 py-3 text-left">Độ khó</th>
                  <th className="w-44 px-3 py-3 text-left">Đang dùng</th>
                  <th className="w-24 px-3 py-3 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((q, idx) => (
                  <QuestionRow
                    key={q.id}
                    question={q}
                    index={startIndex + idx + 1}
                    selected={selected.has(q.id)}
                    onToggle={handleToggle}
                    onDelete={handleDeleteOne}
                    pending={removeOne.isPending || bulkRemove.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {rows.map((q, idx) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={startIndex + idx + 1}
                selected={selected.has(q.id)}
                onToggle={handleToggle}
                onDelete={handleDeleteOne}
                pending={removeOne.isPending || bulkRemove.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
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

      {/* Import Excel modal — shared component với /instructor/questions.
          Sau import: invalidate cache admin + instructor để cả 2 view đều
          thấy câu mới. Modal tự gọi questionsApi.import() và backend
          tự set createdBy = admin. */}
      <ExcelImportModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

// =====================================================
// Sub-components
// =====================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-12 animate-pulse rounded-card bg-surface-2" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-card bg-surface-2" />
      ))}
    </div>
  );
}

function EmptyState({ hasFilter, onReset }: { hasFilter: boolean; onReset: () => void }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center">
      <p className="text-sm text-muted">
        {hasFilter ? 'Không có câu hỏi nào khớp bộ lọc.' : 'Chưa có câu hỏi nào trong ngân hàng.'}
      </p>
      {hasFilter && (
        <Button variant="outline" size="sm" onClick={onReset} className="mt-4">
          <RotateCcw className="h-4 w-4" />
          Xoá bộ lọc
        </Button>
      )}
    </div>
  );
}

interface RowProps {
  question: QuestionBank;
  index: number;
  selected: boolean;
  onToggle: (id: string, isInUse: boolean) => void;
  onDelete: (q: QuestionBank) => void;
  pending?: boolean;
}

function QuestionRow({ question, index, selected, onToggle, onDelete, pending }: RowProps) {
  const inUseCount = question.usedInQuizCount ?? 0;
  const isInUse = inUseCount > 0;
  const truncated =
    question.question.length > 100 ? question.question.slice(0, 100) + '…' : question.question;
  const deleteDisabled = pending || isInUse;
  const deleteTooltip = isInUse ? `Gỡ khỏi ${inUseCount} quiz trước khi xoá` : undefined;

  return (
    <tr className="transition-colors hover:bg-surface-2/40">
      <td className="px-3 py-3 align-middle">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
          checked={selected}
          disabled={isInUse}
          onChange={() => onToggle(question.id, isInUse)}
          title={isInUse ? 'Câu đang dùng — không chọn được' : undefined}
          aria-label={`Chọn câu ${index}`}
        />
      </td>
      <td className="px-3 py-3 align-middle text-xs text-muted">{index}</td>
      <td className="px-3 py-3 align-middle">
        <p className="line-clamp-2 text-sm font-medium text-foreground">{truncated}</p>
      </td>
      <td className="px-3 py-3 align-middle">
        {question.creator ? (
          <div className="min-w-0">
            <div className="truncate text-sm text-foreground">{question.creator.name}</div>
            <div className="truncate text-xs text-muted">{question.creator.email}</div>
          </div>
        ) : (
          <span className="text-xs italic text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        <DifficultyBadge difficulty={question.difficulty} />
      </td>
      <td className="px-3 py-3 align-middle">
        {isInUse ? (
          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
            Đang dùng trong {inUseCount} quiz
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Chưa dùng
          </span>
        )}
      </td>
      <td className="px-3 py-3 align-middle text-right">
        <button
          type="button"
          onClick={() => onDelete(question)}
          disabled={deleteDisabled}
          title={deleteTooltip}
          className="inline-flex h-8 items-center gap-1 rounded-button bg-surface-2 px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2 disabled:hover:text-muted dark:hover:text-rose-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Xoá
        </button>
      </td>
    </tr>
  );
}

function QuestionCard({ question, index, selected, onToggle, onDelete, pending }: RowProps) {
  const inUseCount = question.usedInQuizCount ?? 0;
  const isInUse = inUseCount > 0;
  const deleteDisabled = pending || isInUse;
  const deleteTooltip = isInUse ? `Gỡ khỏi ${inUseCount} quiz trước khi xoá` : undefined;
  const truncated =
    question.question.length > 100 ? question.question.slice(0, 100) + '…' : question.question;

  return (
    <div className="flex items-start gap-3 p-4">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 flex-shrink-0 rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        checked={selected}
        disabled={isInUse}
        onChange={() => onToggle(question.id, isInUse)}
        aria-label={`Chọn câu ${index}`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold text-muted">#{index}</span>
          <DifficultyBadge difficulty={question.difficulty} />
        </div>
        <p className="text-sm font-medium text-foreground">{truncated}</p>
        {question.creator && (
          <div className="text-xs text-muted">
            <span className="font-semibold text-foreground">{question.creator.name}</span>
            <span> · {question.creator.email}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          {isInUse ? (
            <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              Đang dùng trong {inUseCount} quiz
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Chưa dùng
            </span>
          )}
          <button
            type="button"
            onClick={() => onDelete(question)}
            disabled={deleteDisabled}
            title={deleteTooltip}
            className="inline-flex h-8 items-center gap-1 rounded-button bg-surface-2 px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xoá
          </button>
        </div>
      </div>
    </div>
  );
}
