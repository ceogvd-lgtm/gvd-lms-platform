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
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Generic DataTable powered by TanStack Table v8.
 *
 * Features (all opt-in via props):
 *   - sortable columns (click header)
 *   - global text filter
 *   - pagination (page-size and prev/next)
 *   - row selection (checkbox column added automatically)
 *   - sticky header
 *
 * Define columns with `ColumnDef<T>` from @tanstack/react-table; they're
 * re-exported below so consumers don't need a direct dep.
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
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // Inject a checkbox column at the front when selectable.
  const finalColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
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
    };
    return [checkboxCol, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  // Notify consumer of selection changes. The table instance is stable
  // across renders so it doesn't need to be a dep.
  React.useEffect(() => {
    if (!onSelectionChange) return;
    const rows = table.getSelectedRowModel().rows.map((r) => r.original);
    onSelectionChange(rows);
  }, [rowSelection, onSelectionChange, table]);

  return (
    <div className={cn('space-y-3', className)}>
      {searchable && (
        <input
          type="search"
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full max-w-sm rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
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
              {table.getRowModel().rows.length === 0 ? (
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
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Trang {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            {' · Tổng '}
            {table.getFilteredRowModel().rows.length}
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
