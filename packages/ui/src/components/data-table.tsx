'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Generic DataTable powered by TanStack Table v8.
 *
 * **Two modes** (controlled by `manualPagination` / `manualFiltering` / `manualSorting`):
 *
 *   1. **Client-side (default)** — DataTable handles sort, filter, pagination
 *      internally. Best for small datasets (<500 rows) already in memory.
 *
 *   2. **Server-side** — set `manualPagination` / `manualFiltering` /
 *      `manualSorting` to `true` and supply `pageCount` + change handlers.
 *      The parent drives the query; DataTable only renders. This is what
 *      /admin/users and /admin/audit-log use in Phase 09 because their
 *      result sets can grow to thousands of rows.
 *
 * Features (all opt-in via props):
 *   - sortable columns (click header)
 *   - global text filter (debounced 300ms in server-side mode)
 *   - pagination (page-size and prev/next)
 *   - row selection (checkbox column added automatically)
 *   - sticky header
 *   - loading skeleton rows
 *   - optional rowActions column rendered at the end of each row
 */
export type { ColumnDef } from '@tanstack/react-table';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Show a global filter input above the table. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Enable row selection with checkbox column. */
  selectable?: boolean;
  onSelectionChange?: (rows: T[]) => void;
  pageSize?: number;
  /** Sticky header (requires the parent to constrain the table height). */
  stickyHeader?: boolean;
  /** Custom empty state. */
  emptyState?: React.ReactNode;
  className?: string;

  // ---------- Server-side mode ----------
  /**
   * Opt-in: the parent is handling pagination via an API. DataTable will
   * not paginate rows itself and will emit `onPaginationChange` when the
   * user clicks prev/next. `pageCount` (number of pages) must be supplied.
   */
  manualPagination?: boolean;
  pageCount?: number;
  pageIndex?: number;
  onPaginationChange?: (state: { pageIndex: number; pageSize: number }) => void;

  /** Opt-in: the parent handles global filter via an API. */
  manualFiltering?: boolean;
  /** Called (debounced 300ms) when the user types in the search input. */
  onGlobalFilterChange?: (value: string) => void;

  /** Opt-in: the parent handles column sort via an API. */
  manualSorting?: boolean;
  onSortingChange?: (state: SortingState) => void;

  // ---------- Visual state ----------
  /** Show skeleton rows while data is fetching. */
  loading?: boolean;
  /** Number of skeleton rows to show during load (default 5). */
  loadingRows?: number;
  /** Extra content rendered at the end of each row (e.g. action buttons). */
  rowActions?: (row: T) => React.ReactNode;
  /** Toolbar rendered above the table (e.g. bulk actions). */
  toolbar?: React.ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = 'Tìm kiếm…',
  selectable = false,
  onSelectionChange,
  pageSize = 10,
  stickyHeader = false,
  emptyState,
  className,
  manualPagination = false,
  pageCount,
  pageIndex: pageIndexProp,
  onPaginationChange,
  manualFiltering = false,
  onGlobalFilterChange,
  manualSorting = false,
  onSortingChange,
  loading = false,
  loadingRows = 5,
  rowActions,
  toolbar,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: pageIndexProp ?? 0,
    pageSize,
  });

  // Keep the internal pageIndex in sync with prop changes (server-side mode).
  React.useEffect(() => {
    if (manualPagination && pageIndexProp !== undefined) {
      setPagination((p) =>
        p.pageIndex === pageIndexProp ? p : { ...p, pageIndex: pageIndexProp },
      );
    }
  }, [manualPagination, pageIndexProp]);

  // Debounce global filter in server-side mode so each keystroke doesn't
  // fire a network request. Client-side mode applies instantly.
  React.useEffect(() => {
    if (!manualFiltering || !onGlobalFilterChange) return;
    const timer = setTimeout(() => {
      onGlobalFilterChange(globalFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [globalFilter, manualFiltering, onGlobalFilterChange]);

  // Inject a checkbox column at the front when selectable; and a row-actions
  // column at the end when rowActions is supplied.
  const finalColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    const cols: ColumnDef<T, unknown>[] = [...columns];
    if (selectable) {
      const checkboxCol: ColumnDef<T, unknown> = {
        id: '__select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el)
                el.indeterminate =
                  !table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected();
            }}
            onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
            aria-label="Chọn tất cả"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(!!e.target.checked)}
            aria-label="Chọn dòng"
          />
        ),
        enableSorting: false,
        enableGlobalFilter: false,
      };
      cols.unshift(checkboxCol);
    }
    if (rowActions) {
      cols.push({
        id: '__actions',
        header: () => <span className="sr-only">Hành động</span>,
        cell: ({ row }) => <div className="flex justify-end">{rowActions(row.original)}</div>,
        enableSorting: false,
        enableGlobalFilter: false,
      });
    }
    return cols;
  }, [columns, selectable, rowActions]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    pageCount: manualPagination ? (pageCount ?? -1) : undefined,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
      pagination,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      if (manualSorting) onSortingChange?.(next);
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setPagination(next);
      if (manualPagination) onPaginationChange?.(next);
    },
    manualPagination,
    manualFiltering,
    manualSorting,
    getCoreRowModel: getCoreRowModel(),
    // These models are no-ops when the corresponding `manual*` flag is set.
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
  });

  // Notify consumer of selection changes. The table instance is stable
  // across renders so it doesn't need to be a dep.
  React.useEffect(() => {
    if (!onSelectionChange) return;
    const rows = table.getSelectedRowModel().rows.map((r) => r.original);
    onSelectionChange(rows);
  }, [rowSelection, onSelectionChange, table]);

  const showingLoadingRows = loading && data.length === 0;
  const totalCount = manualPagination
    ? (pageCount ?? 1) * pagination.pageSize
    : table.getFilteredRowModel().rows.length;
  const currentPage = pagination.pageIndex + 1;
  const totalPages = manualPagination ? (pageCount ?? 1) : table.getPageCount();

  return (
    <div className={cn('space-y-3', className)}>
      {(searchable || toolbar) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {searchable ? (
            <input
              type="search"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full max-w-sm rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
            />
          ) : (
            <span />
          )}
          {toolbar}
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className={cn(stickyHeader && 'max-h-[600px] overflow-auto')}>
          <table className="w-full text-sm">
            <thead
              className={cn(
                'border-b border-border bg-surface-2/60 text-left',
                stickyHeader && 'sticky top-0 z-10',
              )}
            >
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const sortable = header.column.getCanSort();
                    const dir = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted"
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            disabled={!sortable}
                            className={cn(
                              'inline-flex items-center gap-1.5',
                              sortable && 'cursor-pointer hover:text-foreground',
                            )}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sortable &&
                              (dir === 'asc' ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : dir === 'desc' ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ChevronsUpDown className="h-3 w-3 opacity-40" />
                              ))}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {showingLoadingRows ? (
                Array.from({ length: loadingRows }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    {finalColumns.map((_c, ci) => (
                      <td key={ci} className="px-4 py-4">
                        <div className="h-3 w-full max-w-[160px] rounded bg-surface-2" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={finalColumns.length} className="px-4 py-12 text-center text-muted">
                    {emptyState ?? 'Không có dữ liệu'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      row.getIsSelected() ? 'bg-primary/5' : 'hover:bg-surface-2/50',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Trang {currentPage} / {totalPages}
            {!manualPagination && ` · Tổng ${totalCount}`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded-button border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-surface-2"
            >
              Trước
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded-button border border-border px-3 py-1.5 disabled:opacity-50 hover:bg-surface-2"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
