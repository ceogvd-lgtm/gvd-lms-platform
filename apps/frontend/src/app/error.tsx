'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-2xl font-semibold text-red-600">Đã có lỗi xảy ra</h2>
      <p className="text-slate-600 dark:text-slate-400">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-button bg-primary px-4 py-2 text-white hover:bg-primary-700"
      >
        Thử lại
      </button>
    </div>
  );
}
