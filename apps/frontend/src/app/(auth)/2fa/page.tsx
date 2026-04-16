'use client';

import { Button } from '@lms/ui';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { OtpInput } from '@/components/ui/otp-input';
import { formatMMSS, useCountdown } from '@/hooks/use-countdown';
import { ApiError, authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const OTP_TTL_SEC = 10 * 60;
const RESEND_COOLDOWN_SEC = 60;

export default function TwoFactorPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [tempToken, setTempToken] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SEC);

  const ttl = useCountdown(OTP_TTL_SEC);
  const cooldown = useCountdown(resendCooldown);

  useEffect(() => {
    const t = sessionStorage.getItem('lms-temp-token');
    if (!t) {
      router.replace('/login');
      return;
    }
    setTempToken(t);
  }, [router]);

  useEffect(() => {
    if (otp.length === 6 && !verifying && tempToken) {
      void handleVerify(otp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleVerify = async (code: string) => {
    if (!tempToken) return;
    setVerifying(true);
    setError(false);
    try {
      const res = await authApi.verify2FA({ tempToken, otp: code });
      setSession(res);
      sessionStorage.removeItem('lms-temp-token');
      toast.success('Xác thực thành công');
      router.push('/');
    } catch (err) {
      setError(true);
      setOtp('');
      const msg = err instanceof ApiError ? err.message : 'Mã không hợp lệ';
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!tempToken || cooldown > 0) return;
    try {
      await authApi.send2FA(tempToken);
      toast.success('Đã gửi lại mã OTP');
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Không gửi được mã';
      toast.error(msg);
    }
  };

  return (
    <>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary-50 dark:bg-secondary-900/30">
          <ShieldCheck className="h-8 w-8 text-secondary" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Xác thực 2 lớp</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Nhập mã 6 chữ số vừa được gửi đến email của bạn
        </p>
      </div>

      <OtpInput value={otp} onChange={setOtp} disabled={verifying} error={error} />

      <div className="mt-6 flex items-center justify-center gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">Mã hết hạn sau</span>
        <span className="font-mono font-semibold text-primary tabular-nums">{formatMMSS(ttl)}</span>
      </div>

      <Button
        type="button"
        size="lg"
        className="mt-6 w-full"
        disabled={otp.length !== 6 || verifying}
        onClick={() => handleVerify(otp)}
      >
        {verifying ? 'Đang xác thực…' : 'Xác thực'}
      </Button>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        Không nhận được mã?{' '}
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="font-semibold text-primary hover:text-primary-700 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại'}
        </button>
      </p>
    </>
  );
}
