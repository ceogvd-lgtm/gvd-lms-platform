'use client';

import { Button, Card, CardContent } from '@lms/ui';
import { AlertCircle } from 'lucide-react';

export default function MyLearningError({
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
          <AlertCircle className="h-10 w-10 text-error" />
          <p className="text-base font-semibold text-foreground">Lỗi tải lộ trình học tập</p>
          <p className="max-w-md text-sm text-muted">{error.message || 'Lỗi không xác định.'}</p>
          <Button variant="outline" size="sm" onClick={reset}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
