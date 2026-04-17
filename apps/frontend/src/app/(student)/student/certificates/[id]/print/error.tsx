'use client';

import { Button } from '@lms/ui';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[600px] px-4 py-10">
      <div className="rounded-card border border-error/30 bg-error/5 p-6 text-center">
        <p className="mb-3 text-sm font-semibold text-error">Không hiển thị được chứng chỉ</p>
        <Button variant="outline" onClick={() => reset()}>
          Thử lại
        </Button>
      </div>
    </div>
  );
}
