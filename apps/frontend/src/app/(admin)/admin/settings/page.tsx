'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@lms/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Database,
  HardDrive,
  Mail,
  Save,
  Shield,
  Sparkles,
  TestTube2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AiHealthPanel } from '@/components/ai/ai-health-panel';
import { adminSettingsApi, ApiError, type SystemSettingRow } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

/**
 * System Settings page (Phase 09).
 *
 * SUPER_ADMIN: full edit + SMTP test + backup trigger.
 * ADMIN: read-only view with disabled inputs — the backend reads the
 *   settings with `smtp.pass` masked, and PATCH is blocked by
 *   `@Roles(SUPER_ADMIN)` at the route. Defense-in-depth: client also
 *   disables the inputs and shows a tooltip so an admin doesn't get a
 *   frustrating "permission denied" error after clicking Save.
 */

type DraftMap = Record<string, unknown>;

function settingsToDraft(rows: SystemSettingRow[]): DraftMap {
  const draft: DraftMap = {};
  for (const r of rows) draft[r.key] = r.value;
  return draft;
}

function isDirty(draft: DraftMap, rows: SystemSettingRow[]): boolean {
  for (const r of rows) {
    if (JSON.stringify(draft[r.key]) !== JSON.stringify(r.value)) return true;
  }
  return false;
}

export default function AdminSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminSettingsApi.getAll(accessToken!),
    enabled: !!accessToken,
  });

  const backupHistoryQuery = useQuery({
    queryKey: ['admin-backup-history'],
    queryFn: () => adminSettingsApi.getBackupHistory(accessToken!),
    enabled: !!accessToken && isSuperAdmin,
  });

  const [draft, setDraft] = useState<DraftMap>({});
  const [saving, setSaving] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [triggeringBackup, setTriggeringBackup] = useState(false);

  // Sync draft with server data on load
  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(settingsToDraft(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const dirty = useMemo(
    () => !!settingsQuery.data && isDirty(draft, settingsQuery.data),
    [draft, settingsQuery.data],
  );

  const get = (key: string): unknown => draft[key];
  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    if (!settingsQuery.data) return;
    const changes = settingsQuery.data
      .filter((r) => JSON.stringify(draft[r.key]) !== JSON.stringify(r.value))
      .map((r) => ({ key: r.key, value: draft[r.key] }));

    if (changes.length === 0) return;

    setSaving(true);
    try {
      await adminSettingsApi.update(changes, accessToken!);
      toast.success(`Đã lưu ${changes.length} thay đổi`);
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Lưu thất bại';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpResult(null);
    try {
      const result = await adminSettingsApi.testSmtp(
        {
          host: (get('smtp.host') as string) || undefined,
          port: (get('smtp.port') as number) || undefined,
          user: (get('smtp.user') as string) || undefined,
          pass: (get('smtp.pass') as string) || undefined,
          from: (get('smtp.from') as string) || undefined,
        },
        accessToken!,
      );
      setSmtpResult(result);
      if (result.ok) toast.success('SMTP kết nối thành công');
      else toast.error(`SMTP lỗi: ${result.error}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Test SMTP thất bại';
      toast.error(msg);
      setSmtpResult({ ok: false, error: msg });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTriggerBackup = async () => {
    if (!confirm('Trigger backup cơ sở dữ liệu ngay bây giờ?')) return;
    setTriggeringBackup(true);
    try {
      const result = await adminSettingsApi.triggerBackup(accessToken!);
      toast.success(result.message);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Backup thất bại';
      toast.error(msg);
    } finally {
      setTriggeringBackup(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cài đặt hệ thống</h1>
        <p className="mt-1 text-sm text-muted">
          Cấu hình tên tổ chức, SMTP, chính sách bảo mật, lưu trữ và backup.
        </p>
      </div>

      {!isSuperAdmin && (
        <div className="flex items-start gap-3 rounded-card border border-warning/40 bg-warning/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">Chỉ xem</p>
            <p className="mt-0.5 text-muted">
              Chỉ <strong>Super Admin</strong> mới được sửa cài đặt hệ thống. Bạn có thể xem nhưng
              không thay đổi được giá trị. Trường <code>smtp.pass</code> sẽ hiển thị dưới dạng{' '}
              <code>***</code>.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">Tổ chức</TabsTrigger>
          <TabsTrigger value="email">Email / SMTP</TabsTrigger>
          <TabsTrigger value="security">Bảo mật</TabsTrigger>
          <TabsTrigger value="storage">Lưu trữ</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="h-3.5 w-3.5" /> AI & Quota
          </TabsTrigger>
        </TabsList>

        {/* ORG */}
        <TabsContent value="org">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin tổ chức</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Tên tổ chức"
                value={(get('org.name') as string) ?? ''}
                onChange={(e) => set('org.name', e.target.value)}
                disabled={!isSuperAdmin}
              />
              <Input
                label="URL logo"
                value={(get('org.logoUrl') as string) ?? ''}
                onChange={(e) => set('org.logoUrl', e.target.value)}
                disabled={!isSuperAdmin}
                helper="Có thể là URL tuyệt đối hoặc đường dẫn /logo-gvd.svg"
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Màu chính (primary)"
                  type="color"
                  value={(get('org.primaryColor') as string) ?? '#1E40AF'}
                  onChange={(e) => set('org.primaryColor', e.target.value)}
                  disabled={!isSuperAdmin}
                />
                <Input
                  label="Màu phụ (secondary)"
                  type="color"
                  value={(get('org.secondaryColor') as string) ?? '#7C3AED'}
                  onChange={(e) => set('org.secondaryColor', e.target.value)}
                  disabled={!isSuperAdmin}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMAIL */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                SMTP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="SMTP host"
                  value={(get('smtp.host') as string) ?? ''}
                  onChange={(e) => set('smtp.host', e.target.value)}
                  disabled={!isSuperAdmin}
                />
                <Input
                  label="SMTP port"
                  type="number"
                  value={String(get('smtp.port') ?? 587)}
                  onChange={(e) => set('smtp.port', Number(e.target.value))}
                  disabled={!isSuperAdmin}
                />
                <Input
                  label="Username"
                  value={(get('smtp.user') as string) ?? ''}
                  onChange={(e) => set('smtp.user', e.target.value)}
                  disabled={!isSuperAdmin}
                />
                <Input
                  label="Password"
                  type="password"
                  value={(get('smtp.pass') as string) ?? ''}
                  onChange={(e) => set('smtp.pass', e.target.value)}
                  disabled={!isSuperAdmin}
                  placeholder={isSuperAdmin ? '' : '***'}
                  helper="Chỉ Super Admin thấy giá trị thật"
                />
                <Input
                  label="From"
                  value={(get('smtp.from') as string) ?? ''}
                  onChange={(e) => set('smtp.from', e.target.value)}
                  disabled={!isSuperAdmin}
                  className="md:col-span-2"
                />
              </div>

              {isSuperAdmin && (
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={handleTestSmtp} disabled={testingSmtp}>
                    <TestTube2 className="h-4 w-4" />
                    {testingSmtp ? 'Đang kiểm tra…' : 'Test kết nối'}
                  </Button>
                  {smtpResult && (
                    <span
                      className={
                        'text-xs font-semibold ' +
                        (smtpResult.ok
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400')
                      }
                    >
                      {smtpResult.ok
                        ? '✓ Kết nối OK'
                        : `✗ ${smtpResult.error ?? 'Kết nối thất bại'}`}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECURITY */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Chính sách bảo mật
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Độ dài mật khẩu tối thiểu"
                type="number"
                min={6}
                max={64}
                value={String(get('security.passwordMinLength') ?? 8)}
                onChange={(e) => set('security.passwordMinLength', Number(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <div className="flex items-center justify-between rounded-card border border-border p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Yêu cầu 2FA cho ADMIN+</p>
                  <p className="text-xs text-muted">
                    Admin và Super Admin bắt buộc bật 2FA khi đăng nhập
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded accent-primary"
                  checked={!!get('security.require2FAAdmin')}
                  onChange={(e) => set('security.require2FAAdmin', e.target.checked)}
                  disabled={!isSuperAdmin}
                />
              </div>
              <Input
                label="Session timeout (phút)"
                type="number"
                min={1}
                max={1440}
                value={String(get('security.sessionTimeoutMin') ?? 15)}
                onChange={(e) => set('security.sessionTimeoutMin', Number(e.target.value))}
                disabled={!isSuperAdmin}
                helper="Thời gian access token hết hiệu lực"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* STORAGE */}
        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-primary" />
                Giới hạn lưu trữ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Dung lượng tối đa per user (MB)"
                type="number"
                min={1}
                value={String(get('storage.maxPerUserMB') ?? 500)}
                onChange={(e) => set('storage.maxPerUserMB', Number(e.target.value))}
                disabled={!isSuperAdmin}
              />
              <Input
                label="Dung lượng tối đa per course (MB)"
                type="number"
                min={1}
                value={String(get('storage.maxPerCourseMB') ?? 2048)}
                onChange={(e) => set('storage.maxPerCourseMB', Number(e.target.value))}
                disabled={!isSuperAdmin}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BACKUP */}
        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Sao lưu cơ sở dữ liệu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-card bg-warning/10 px-4 py-3 text-sm text-warning">
                <strong>Phase 09:</strong> Endpoint backup đang ở chế độ stub. Logic thật (pg_dump +
                upload MinIO + retention) sẽ được triển khai trong Phase 18 (Deploy). Nút
                &ldquo;Trigger&rdquo; bên dưới chỉ ghi vào Audit Log.
              </div>

              {isSuperAdmin && (
                <Button onClick={handleTriggerBackup} disabled={triggeringBackup}>
                  <Database className="h-4 w-4" />
                  {triggeringBackup ? 'Đang xử lý…' : 'Trigger backup ngay'}
                </Button>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">Lịch sử backup</p>
                {backupHistoryQuery.data?.items.length === 0 ? (
                  <p className="text-xs italic text-muted">
                    Chưa có backup nào — Phase 18 sẽ điền danh sách.
                  </p>
                ) : (
                  <p className="text-xs italic text-muted">Đang tải…</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI & Quota (Phase 17) — read-only; operators troubleshoot
            Gemini + ChromaDB without leaving the settings page. */}
        <TabsContent value="ai">
          <AiHealthPanel />
        </TabsContent>
      </Tabs>

      {/* Sticky save bar — only if dirty and super admin */}
      {isSuperAdmin && dirty && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-card border border-primary/40 bg-surface shadow-lg">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-semibold">Có thay đổi chưa lưu</span>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <Button
              variant="ghost"
              onClick={() => settingsQuery.data && setDraft(settingsToDraft(settingsQuery.data))}
              disabled={saving}
            >
              Đặt lại
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
