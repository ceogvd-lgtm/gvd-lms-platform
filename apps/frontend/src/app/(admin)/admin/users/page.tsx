'use client';

import {
  Avatar,
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  type ColumnDef,
} from '@lms/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MoreVertical,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BlockUserModal } from '@/components/admin/block-user-modal';
import { ChangeRoleModal } from '@/components/admin/change-role-modal';
import { CreateAdminModal } from '@/components/admin/create-admin-modal';
import { RoleBadge } from '@/components/ui/role-badge';
import { adminApi, ApiError, triggerBlobDownload, type AdminUser } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { checkAdminRules, type Actor, type Role } from '@/lib/rbac';

const ROLE_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Super Admin', value: 'SUPER_ADMIN' },
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Instructor', value: 'INSTRUCTOR' },
  { label: 'Student', value: 'STUDENT' },
];

const STATUS_FILTERS: Array<{ label: string; value: 'active' | 'blocked' | '' }> = [
  { label: 'Tất cả trạng thái', value: '' },
  { label: 'Đang hoạt động', value: 'active' },
  { label: 'Đã bị khoá', value: 'blocked' },
];

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'blocked' | ''>('');
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedRows, setSelectedRows] = useState<AdminUser[]>([]);
  const [changingRoleFor, setChangingRoleFor] = useState<AdminUser | null>(null);
  const [blockingUser, setBlockingUser] = useState<AdminUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['admin-users', { q: search, role: roleFilter, status: statusFilter, pageIndex }],
    queryFn: () =>
      adminApi.listUsers(
        {
          q: search || undefined,
          role: roleFilter || undefined,
          status: (statusFilter || undefined) as 'active' | 'blocked' | undefined,
          page: pageIndex + 1,
          limit: PAGE_SIZE,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  const actor: Actor | null = useMemo(
    () => (me ? { id: me.id, role: me.role as Role } : null),
    [me],
  );

  const superAdminCount = useMemo(
    () => query.data?.data.filter((u) => u.role === 'SUPER_ADMIN').length ?? 2,
    [query.data],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Xoá vĩnh viễn ${user.email}?`)) return;
    try {
      await adminApi.deleteUser(user.id, accessToken!);
      toast.success(`Đã xoá ${user.name}`);
      invalidate();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Xoá thất bại';
      toast.error(msg);
    }
  };

  const handleBulkBlock = async (blocked: boolean) => {
    if (selectedRows.length === 0) return;
    try {
      const result = await adminApi.bulkBlock(
        { ids: selectedRows.map((u) => u.id), blocked },
        accessToken!,
      );
      if (result.failed.length === 0) {
        toast.success(`Đã ${blocked ? 'khoá' : 'mở khoá'} ${result.ok.length} tài khoản`);
      } else {
        toast.warning(`${result.ok.length} OK, ${result.failed.length} thất bại. Xem Audit Log.`);
      }
      setSelectedRows([]);
      invalidate();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Bulk action thất bại';
      toast.error(msg);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      const blob = await adminApi.exportUsers(
        {
          format,
          q: search || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        },
        accessToken!,
      );
      const timestamp = new Date().toISOString().split('T')[0];
      triggerBlobDownload(blob, `users-${timestamp}.${format}`);
      toast.success('Đã tải xuống danh sách người dùng');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Export thất bại';
      toast.error(msg);
    }
  };

  // ---------- Columns ----------
  // NOTE: hooks must stay above any early-return guard so they are called in
  // the same order on every render. Don't move this below `if (!actor) return null`.
  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        id: 'user',
        header: 'Người dùng',
        cell: ({ row }) => {
          const u = row.original;
          const initials = u.name
            .split(' ')
            .map((s) => s[0])
            .filter(Boolean)
            .slice(-2)
            .join('');
          return (
            <div className="flex items-center gap-3">
              <Avatar size="sm" src={u.avatar ?? undefined} initials={initials} />
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{u.name}</div>
                <div className="truncate text-xs text-muted">{u.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        id: 'role',
        header: 'Vai trò',
        cell: ({ row }) => <RoleBadge role={row.original.role as Role} />,
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) =>
          row.original.isBlocked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <Ban className="h-3 w-3" /> Bị khoá
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Đang hoạt động
            </span>
          ),
      },
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        cell: ({ row }) => (
          <span className="text-xs text-muted">
            {new Date(row.original.createdAt).toLocaleDateString('vi-VN')}
          </span>
        ),
      },
    ],
    [],
  );

  // Early return AFTER all hooks have run — avoids "hooks called conditionally".
  if (!actor) return null;
  const isSuperAdmin = actor.role === 'SUPER_ADMIN';

  // ---------- Row actions (Dropdown) with 4-Law tooltips ----------
  const rowActions = (u: AdminUser) => {
    const target = { id: u.id, role: u.role as Role };
    const canUpdateRole = checkAdminRules(actor, target, 'UPDATE_ROLE', { superAdminCount });
    const canBlock = checkAdminRules(actor, target, 'BLOCK_USER');
    const canDelete = checkAdminRules(actor, target, 'DELETE_USER', { superAdminCount });

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-button text-muted hover:bg-surface-2 hover:text-foreground transition-colors"
            aria-label="Hành động"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuItem
            disabled={!canUpdateRole.allowed}
            title={canUpdateRole.reason}
            onSelect={() => setChangingRoleFor(u)}
          >
            <UserCog className="h-4 w-4" />
            Đổi vai trò
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canBlock.allowed}
            title={canBlock.reason}
            onSelect={() => setBlockingUser(u)}
          >
            <ShieldCheck className="h-4 w-4" />
            {u.isBlocked ? 'Mở khoá' : 'Khoá tài khoản'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            disabled={!canDelete.allowed}
            title={canDelete.reason}
            onSelect={() => handleDelete(u)}
          >
            <Trash2 className="h-4 w-4" />
            Xoá người dùng
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý người dùng</h1>
          <p className="mt-1 text-sm text-muted">
            Tạo, khoá, đổi vai trò hoặc xoá người dùng. Nút bị vô hiệu hoá hiển thị tooltip lý do.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4" />
            Xuất CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" />
            Xuất Excel
          </Button>
          {isSuperAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Tạo Admin
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPageIndex(0);
            setSearch(e.target.value);
          }}
          placeholder="Tìm theo tên hoặc email…"
          className="h-10 w-full rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || 'all-s'}
              type="button"
              onClick={() => {
                setPageIndex(0);
                setStatusFilter(s.value);
              }}
              className={
                'whitespace-nowrap rounded-button px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (statusFilter === s.value
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-muted hover:bg-surface-2/80')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ROLE_FILTERS.map((r) => (
          <button
            key={r.value || 'all-r'}
            type="button"
            onClick={() => {
              setPageIndex(0);
              setRoleFilter(r.value);
            }}
            className={
              'whitespace-nowrap rounded-button px-3 py-1.5 text-xs font-semibold transition-colors ' +
              (roleFilter === r.value
                ? 'bg-primary text-white'
                : 'bg-surface-2 text-muted hover:bg-surface-2/80')
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Bulk action toolbar — shown when selection is non-empty */}
      {selectedRows.length > 0 && (
        <div className="flex items-center justify-between rounded-card border border-primary/40 bg-primary/5 px-4 py-3">
          <span className="text-sm font-semibold text-primary">
            Đã chọn {selectedRows.length} người dùng
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulkBlock(true)}>
              <Ban className="h-4 w-4" /> Khoá tất cả
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkBlock(false)}>
              <CheckCircle2 className="h-4 w-4" /> Mở khoá tất cả
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedRows([])}>
              Bỏ chọn
            </Button>
          </div>
        </div>
      )}

      {/* DataTable — server-side */}
      <DataTable
        data={query.data?.data ?? []}
        columns={columns}
        selectable
        onSelectionChange={setSelectedRows}
        manualPagination
        pageCount={totalPages}
        pageIndex={pageIndex}
        onPaginationChange={(s) => setPageIndex(s.pageIndex)}
        loading={query.isLoading}
        rowActions={rowActions}
        emptyState={
          query.isError
            ? (query.error as Error).message
            : 'Không có người dùng nào khớp với bộ lọc.'
        }
      />

      {/* Modals */}
      <ChangeRoleModal
        open={!!changingRoleFor}
        onClose={() => setChangingRoleFor(null)}
        target={changingRoleFor}
        onConfirm={async (newRole) => {
          await adminApi.updateRole(changingRoleFor!.id, newRole, accessToken!);
          invalidate();
        }}
      />
      <BlockUserModal
        open={!!blockingUser}
        onClose={() => setBlockingUser(null)}
        target={blockingUser}
        onConfirm={async (blocked) => {
          await adminApi.setBlocked(blockingUser!.id, blocked, accessToken!);
          invalidate();
        }}
      />
      <CreateAdminModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => invalidate()}
      />
    </div>
  );
}
