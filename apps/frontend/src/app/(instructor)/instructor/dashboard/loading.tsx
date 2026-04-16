export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
      <div className="h-[280px] animate-pulse rounded-card bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[360px] animate-pulse rounded-card bg-surface-2 lg:col-span-2" />
        <div className="h-[360px] animate-pulse rounded-card bg-surface-2" />
      </div>
    </div>
  );
}
