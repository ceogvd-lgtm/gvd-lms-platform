/**
 * Skeleton shimmer for any auth page while its bundle / data loads.
 */
export default function AuthLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-2/3 rounded-button bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-1/2 rounded-button bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-12 rounded-button bg-slate-200 dark:bg-slate-700" />
      <div className="h-12 rounded-button bg-slate-200 dark:bg-slate-700" />
      <div className="h-12 rounded-button bg-slate-200 dark:bg-slate-700" />
      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs uppercase tracking-wider text-slate-300">hoặc</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-12 rounded-button bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}
