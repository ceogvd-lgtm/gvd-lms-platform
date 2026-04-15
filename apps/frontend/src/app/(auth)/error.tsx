'use client';

import { Button } from '@lms/ui';
import { AlertTriangle } from 'lucide-react';

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">Đã có lỗi xảy ra</h2>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        {error.message || 'Không thể tải trang này.'}
      </p>
      <Button size="lg" className="w-full" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
