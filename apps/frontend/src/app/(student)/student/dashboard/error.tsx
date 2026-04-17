'use client';

import { Button, Card, CardContent } from '@lms/ui';
import { AlertCircle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <Card className="border-error/30 bg-error/5">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error/10 text-error">
            <AlertCircle className="h-7 w-7" />
          </div>
          <p className="text-base font-semibold text-foreground">Lỗi tải Dashboard</p>
          <p className="max-w-md text-sm text-muted">
            {error.message || 'Một lỗi không xác định đã xảy ra.'}
          </p>
          <Button variant="outline" size="sm" onClick={reset}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
