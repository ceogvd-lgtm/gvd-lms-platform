'use client';

import { Button } from '@lms/ui';
import { AlertOctagon, RotateCcw } from 'lucide-react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-card border border-rose-500/40 bg-rose-500/5 p-6">
      <div className="flex items-start gap-3">
        <AlertOctagon className="h-5 w-5 text-rose-500" />
        <div className="flex-1">
          <h2 className="font-semibold text-rose-600 dark:text-rose-400">
            Không tải được ngân hàng câu hỏi
          </h2>
          <p className="mt-1 text-sm text-muted">{error.message}</p>
          <Button onClick={reset} className="mt-4" size="sm">
            <RotateCcw className="h-4 w-4" />
            Thử lại
          </Button>
        </div>
      </div>
    </div>
  );
}
