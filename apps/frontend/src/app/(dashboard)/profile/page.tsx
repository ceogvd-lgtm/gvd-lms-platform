'use client';

import {
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Pencil,
  ShieldCheck,
  Upload as UploadIcon,
  UserIcon,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { RoleBadge } from '@/components/ui/role-badge';
import { ApiError, authApi, usersApi } from '@/lib/api';
import { useAuthStore, useHasHydrated } from '@/lib/auth-store';
import type { Role } from '@/lib/rbac';

/**
 * Trang Hồ sơ cá nhân — mọi role authenticated đều vào được.
 *
 * Ba block:
 *   1. Thông tin cơ bản — avatar upload + đổi tên + email readonly + role badge
 *   2. Đổi mật khẩu — oldPassword + newPassword + confirm
 *   3. Xác thực 2 lớp — toggle bật/tắt 2FA, nhập password xác nhận
 *
 * Dùng /users/me (GET + PATCH) để sync với Zustand store sau mỗi update.
 * Tránh đụng vào 17 phase code cũ — chỉ thêm route mới.
 */
export default function ProfilePage() {
  const hasHydrated = useHasHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const storeUser = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);

  const query = useQuery({
    queryKey: ['users-me'],
    queryFn: () => usersApi.getMe(accessToken!),
    enabled: !!accessToken && hasHydrated,
    staleTime: 30_000,
  });

  const user = query.data;

  // ---------- Name edit ----------
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const startEditName = () => {
    setNameInput(user?.name ?? '');
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameInput('');
  };

  const saveName = async () => {
    if (!accessToken || !refreshToken || !storeUser) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error('Tên không được để trống');
      return;
    }
    if (trimmed === user?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const updated = await usersApi.updateMe({ name: trimmed }, accessToken);
      // Update Zustand store để header + sidebar reflect ngay.
      setSession({
        accessToken,
        refreshToken,
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          avatar: updated.avatar,
          emailVerified: updated.emailVerified,
          is2FAEnabled: updated.is2FAEnabled,
        },
      });
      await query.refetch();
      toast.success('Đã cập nhật tên');
      setEditingName(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Cập nhật thất bại');
    } finally {
      setSavingName(false);
    }
  };

  // ---------- Avatar upload ----------
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const openFilePicker = () => fileRef.current?.click();

  const handleAvatarPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = ''; // cho phép chọn lại cùng file
    if (!file || !accessToken || !refreshToken || !storeUser) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ảnh tối đa 5 MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file ảnh');
      return;
    }
    setUploading(true);
    try {
      // 1. Upload file → MinIO qua backend, nhận URL
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      const form = new FormData();
      form.append('file', file);
      const upRes = await fetch(`${baseUrl}/upload/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!upRes.ok) {
        const body = await upRes.text();
        throw new Error(`Upload thất bại: ${body.slice(0, 100)}`);
      }
      const { fileUrl } = (await upRes.json()) as { fileUrl: string };

      // 2. PATCH /users/me với URL mới
      const updated = await usersApi.updateMe({ avatar: fileUrl }, accessToken);
      setSession({
        accessToken,
        refreshToken,
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          avatar: updated.avatar,
          emailVerified: updated.emailVerified,
          is2FAEnabled: updated.is2FAEnabled,
        },
      });
      await query.refetch();
      toast.success('Đã cập nhật avatar');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  };

  // ---------- Password change ----------
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const submitChangePassword = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!accessToken) return;
    if (!oldPw || !newPw) {
      toast.error('Vui lòng nhập đầy đủ mật khẩu cũ và mới');
      return;
    }
    if (newPw.length < 8) {
      toast.error('Mật khẩu mới phải có ít nhất 8 ký tự');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }
    setChangingPw(true);
    try {
      await authApi.changePassword({ oldPassword: oldPw, newPassword: newPw }, accessToken);
      toast.success('Đổi mật khẩu thành công');
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setChangingPw(false);
    }
  };

  // ---------- 2FA toggle ----------
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const submit2FAToggle = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!accessToken || !refreshToken || !storeUser || !user) return;
    if (!twoFaPassword) {
      toast.error('Vui lòng nhập mật khẩu để xác nhận');
      return;
    }
    setTwoFaLoading(true);
    try {
      const target = !user.is2FAEnabled;
      const res = await authApi.toggle2FA({ enable: target, password: twoFaPassword }, accessToken);
      toast.success(res.message);
      setTwoFaPassword('');
      // Cập nhật store để header hiện is2FAEnabled mới
      setSession({
        accessToken,
        refreshToken,
        user: { ...storeUser, is2FAEnabled: res.is2FAEnabled },
      });
      await query.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Thao tác 2FA thất bại');
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ---------- Render ----------
  if (!hasHydrated || query.isLoading) {
    return (
      <div className="space-y-8">
        <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Hồ sơ' }]} />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (query.isError || !user) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Hồ sơ' }]} />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            Không tải được thông tin hồ sơ.{' '}
            <button onClick={() => query.refetch()} className="text-primary hover:underline">
              Thử lại
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const avatarSrc = user.avatar ?? null;
  const joinDate = new Date(user.createdAt).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="space-y-8">
      <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Hồ sơ' }]} />

      <div>
        <h1 className="text-3xl font-bold text-foreground">Hồ sơ của tôi</h1>
        <p className="mt-1 text-sm text-muted">Thông tin cá nhân và cài đặt bảo mật tài khoản.</p>
      </div>

      {/* ---------- Row 1: Thông tin cơ bản ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin cơ bản</CardTitle>
          <CardDescription>Avatar, tên hiển thị và email đăng nhập</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-24 w-24 overflow-hidden rounded-full bg-surface-2 ring-2 ring-border">
                {avatarSrc ? (
                  // MinIO avatar qua /minio proxy → img tag OK
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted">
                    {user.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarPick}
              />
              <Button size="sm" variant="outline" onClick={openFilePicker} disabled={uploading}>
                <UploadIcon className="h-4 w-4" />
                Đổi ảnh
              </Button>
            </div>

            {/* Info */}
            <div className="flex-1 space-y-4 min-w-0">
              {/* Name */}
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                  Tên hiển thị
                </div>
                {editingName ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Tên hiển thị"
                      maxLength={100}
                      className="max-w-sm"
                      disabled={savingName}
                    />
                    <Button size="sm" onClick={saveName} disabled={savingName}>
                      {savingName ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Lưu
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEditName}
                      disabled={savingName}
                    >
                      <X className="h-4 w-4" />
                      Huỷ
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-foreground">{user.name}</span>
                    <button
                      onClick={startEditName}
                      className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground transition-colors"
                      title="Sửa tên"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Email */}
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                  Email
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted" />
                  <span className="text-foreground">{user.email}</span>
                  {user.emailVerified && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                      title="Đã xác thực email"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      đã xác thực
                    </span>
                  )}
                </div>
              </div>

              {/* Role + Join date */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="mr-2 text-xs font-medium uppercase tracking-wider text-muted">
                    Vai trò:
                  </span>
                  <RoleBadge role={user.role as Role} />
                </div>
                <div className="text-muted">Tham gia từ {joinDate}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Row 2: Bảo mật ---------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Password change */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Đổi mật khẩu
            </CardTitle>
            <CardDescription>Dùng mật khẩu cũ để xác nhận</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitChangePassword} className="space-y-3">
              <div className="block text-sm">
                <label htmlFor="pw-old" className="mb-1 block text-muted">
                  Mật khẩu hiện tại
                </label>
                <Input
                  id="pw-old"
                  type="password"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  autoComplete="current-password"
                  disabled={changingPw}
                />
              </div>
              <div className="block text-sm">
                <label htmlFor="pw-new" className="mb-1 block text-muted">
                  Mật khẩu mới
                </label>
                <Input
                  id="pw-new"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  disabled={changingPw}
                />
                <span className="mt-1 block text-xs text-muted">
                  ≥ 8 ký tự, có 1 chữ hoa, 1 số và 1 ký tự đặc biệt
                </span>
              </div>
              <div className="block text-sm">
                <label htmlFor="pw-confirm" className="mb-1 block text-muted">
                  Nhập lại mật khẩu mới
                </label>
                <Input
                  id="pw-confirm"
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  disabled={changingPw}
                />
              </div>
              <Button type="submit" className="w-full" disabled={changingPw}>
                {changingPw ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Đổi mật khẩu
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 2FA toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Xác thực 2 lớp (2FA)
            </CardTitle>
            <CardDescription>
              Mã OTP 6 số gửi qua email mỗi lần đăng nhập, tăng đáng kể tính an toàn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <span
                className={`h-2 w-2 rounded-full ${user.is2FAEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`}
              />
              <span className="text-sm font-semibold">
                {user.is2FAEnabled ? 'Đang BẬT' : 'Đang TẮT'}
              </span>
            </div>
            <form onSubmit={submit2FAToggle} className="space-y-3">
              <div className="block text-sm">
                <label htmlFor="tfa-pw" className="mb-1 block text-muted">
                  Mật khẩu để xác nhận
                </label>
                <Input
                  id="tfa-pw"
                  type="password"
                  value={twoFaPassword}
                  onChange={(e) => setTwoFaPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={twoFaLoading}
                />
              </div>
              <Button
                type="submit"
                variant={user.is2FAEnabled ? 'outline' : 'default'}
                className="w-full"
                disabled={twoFaLoading}
              >
                {twoFaLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {user.is2FAEnabled ? 'Tắt 2FA' : 'Bật 2FA'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Silence eslint về UserIcon nếu không dùng (để sẵn cho icon fallback)
void UserIcon;
