'use client';

import {
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@lms/ui';
import { Bell, Globe, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useHasHydrated } from '@/lib/auth-store';

/**
 * Trang Cài đặt cá nhân — mọi role. KHÔNG cần backend (trừ theme đã có
 * `next-themes` từ Phase 05). Email notification preferences lưu
 * localStorage tạm — future phase sẽ move xuống DB.
 */

// Keys localStorage (prefix `lms-prefs-` để dễ tìm + quét)
const NOTIF_KEYS = {
  CERT: 'lms-prefs-notif-certificate',
  ATRISK: 'lms-prefs-notif-at-risk',
  WEEKLY: 'lms-prefs-notif-weekly',
} as const;

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === 'true';
}

function writeBool(key: string, value: boolean) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, String(value));
  }
}

export default function AccountSettingsPage() {
  const hasHydrated = useHasHydrated();
  const { theme, setTheme, resolvedTheme } = useTheme();

  // ---------- Email notifications (localStorage) ----------
  const [notifCert, setNotifCert] = useState(true);
  const [notifAtRisk, setNotifAtRisk] = useState(true);
  const [notifWeekly, setNotifWeekly] = useState(false);

  // Load một lần sau hydrate để tránh hydration mismatch
  useEffect(() => {
    if (!hasHydrated) return;
    setNotifCert(readBool(NOTIF_KEYS.CERT, true));
    setNotifAtRisk(readBool(NOTIF_KEYS.ATRISK, true));
    setNotifWeekly(readBool(NOTIF_KEYS.WEEKLY, false));
  }, [hasHydrated]);

  const handleToggle = (key: keyof typeof NOTIF_KEYS, current: boolean) => {
    const next = !current;
    writeBool(NOTIF_KEYS[key], next);
    if (key === 'CERT') setNotifCert(next);
    if (key === 'ATRISK') setNotifAtRisk(next);
    if (key === 'WEEKLY') setNotifWeekly(next);
    toast.success(next ? 'Đã bật thông báo' : 'Đã tắt thông báo');
  };

  const activeTheme = theme === 'system' ? resolvedTheme : theme;

  return (
    <div className="space-y-8">
      <Breadcrumb items={[{ label: 'Trang chủ', href: '/' }, { label: 'Cài đặt' }]} />

      <div>
        <h1 className="text-3xl font-bold text-foreground">Cài đặt cá nhân</h1>
        <p className="mt-1 text-sm text-muted">
          Tuỳ chỉnh giao diện, ngôn ngữ và cách nhận thông báo của bạn.
        </p>
      </div>

      {/* ---------- Row 1: Giao diện ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Giao diện
          </CardTitle>
          <CardDescription>Chọn chế độ sáng hoặc tối cho toàn bộ hệ thống.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <ThemeButton
              active={activeTheme === 'light'}
              onClick={() => setTheme('light')}
              icon={Sun}
              label="Sáng"
            />
            <ThemeButton
              active={activeTheme === 'dark'}
              onClick={() => setTheme('dark')}
              icon={Moon}
              label="Tối"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Lựa chọn lưu ở trình duyệt này. Đăng nhập thiết bị khác sẽ cần chọn lại.
          </p>
        </CardContent>
      </Card>

      {/* ---------- Row 2: Ngôn ngữ ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Ngôn ngữ
          </CardTitle>
          <CardDescription>Ngôn ngữ hiển thị giao diện.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="block text-sm">
            <label htmlFor="lang-select" className="mb-1 block text-muted">
              Chọn ngôn ngữ
            </label>
            <select
              id="lang-select"
              className="h-10 w-full max-w-xs rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
              defaultValue="vi"
              disabled
              title="Tính năng đa ngôn ngữ sẽ có trong bản tiếp theo"
            >
              <option value="vi">🇻🇳 Tiếng Việt (mặc định)</option>
              <option value="en" disabled>
                🇺🇸 English — sắp có
              </option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Row 3: Thông báo email ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Thông báo qua email
          </CardTitle>
          <CardDescription>
            Chọn loại email bạn muốn nhận. Tuỳ chọn lưu trên trình duyệt này.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <NotifRow
            title="Nhận thông báo chứng chỉ"
            desc="Email khi bạn đạt chứng chỉ khoá học mới."
            checked={notifCert}
            onToggle={() => handleToggle('CERT', notifCert)}
          />
          <NotifRow
            title="Nhận cảnh báo học tập"
            desc="Email khi hệ thống phát hiện bạn có nguy cơ tụt tiến độ (at-risk)."
            checked={notifAtRisk}
            onToggle={() => handleToggle('ATRISK', notifAtRisk)}
          />
          <NotifRow
            title="Nhận báo cáo tuần"
            desc="Tổng hợp tiến độ, XP và hoạt động nổi bật mỗi đầu tuần."
            checked={notifWeekly}
            onToggle={() => handleToggle('WEEKLY', notifWeekly)}
          />
          <p className="pt-2 text-xs text-muted">
            ⚠️ Lưu ý: cấu hình hiện lưu cục bộ. Bản production sẽ đồng bộ với tài khoản để áp cho
            mọi thiết bị.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Sub-components ----------

function ThemeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sun;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className="min-w-[110px]"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function NotifRow({
  title,
  desc,
  checked,
  onToggle,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs text-muted">{desc}</div>
      </div>
      {/* Toggle thuần CSS — @lms/ui chưa có Switch component */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
