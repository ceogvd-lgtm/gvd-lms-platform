'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldAlert, Trash2, UserCog } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BlockUserModal } from '@/components/admin/block-user-modal';
import { ChangeRoleModal } from '@/components/admin/change-role-modal';
import { UserActionButton } from '@/components/admin/user-action-button';
import { RoleBadge } from '@/components/ui/role-badge';
import { adminApi, type AdminUser, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { Actor, Role } from '@/lib/rbac';

const ROLE_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Super Admin', value: 'SUPER_ADMIN' },
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Instructor', value: 'INSTRUCTOR' },
  { label: 'Student', value: 'STUDENT' },
];

export default function AdminUsersPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [changingRoleFor, setChangingRoleFor] = useState<AdminUser | null>(null);
  const [blockingUser, setBlockingUser] = useState<AdminUser | null>(null);

  const query = useQuery({
    queryKey: ['admin-users', { q: search, role, page }],
    queryFn: () =>
      adminApi.listUsers(
        { q: search || undefined, role: role || undefined, page, limit: 20 },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  const actor: Actor | null = useMemo(
    () =>
      me
        ? {
            id: me.id,
            role: me.role as Role,
          }
        : null,
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

  if (!actor) return null;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quản lý người dùng</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tạo, khoá, đổi vai trò hoặc xoá người dùng. Các nút bị vô hiệu hoá có tooltip giải thích
          lý do.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Tìm theo tên hoặc email…"
            className="h-10 w-full rounded-button border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-dark-surface dark:focus:ring-primary-900/40"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r.value || 'all'}
              type="button"
              onClick={() => {
                setPage(1);
                setRole(r.value);
              }}
              className={
                'whitespace-nowrap rounded-button px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (role === r.value
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700')
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-slate-200 bg-white dark:border-slate-700 dark:bg-dark-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Người dùng</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {query.isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Đang tải…
                </td>
              </tr>
            )}
            {query.isError && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-red-500">
                  {(query.error as Error).message}
                </td>
              </tr>
            )}
            {query.data?.data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Không có người dùng nào khớp.
                </td>
              </tr>
            )}
            {query.data?.data.map((u) => {
              const target = { id: u.id, role: u.role };
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{u.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    {u.isBlocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/20 dark:text-red-400">
                        <ShieldAlert className="h-3 w-3" /> Blocked
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <UserActionButton
                        actor={actor}
                        target={target}
                        action="UPDATE_ROLE"
                        ctx={{ superAdminCount }}
                        variant="primary"
                        onClick={() => setChangingRoleFor(u)}
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        Role
                      </UserActionButton>
                      <UserActionButton
                        actor={actor}
                        target={target}
                        action="BLOCK_USER"
                        variant={u.isBlocked ? 'secondary' : 'danger'}
                        onClick={() => setBlockingUser(u)}
                      >
                        {u.isBlocked ? 'Unblock' : 'Block'}
                      </UserActionButton>
                      <UserActionButton
                        actor={actor}
                        target={target}
                        action="DELETE_USER"
                        ctx={{ superAdminCount }}
                        variant="danger"
                        onClick={() => handleDelete(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </UserActionButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {query.data && query.data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Trang {query.data.page} / {query.data.totalPages} · Tổng {query.data.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-button border border-slate-200 px-3 py-1.5 disabled:opacity-50 dark:border-slate-700"
            >
              Trước
            </button>
            <button
              disabled={page >= (query.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-button border border-slate-200 px-3 py-1.5 disabled:opacity-50 dark:border-slate-700"
            >
              Sau
            </button>
          </div>
        </div>
      )}

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
    </>
  );
}
