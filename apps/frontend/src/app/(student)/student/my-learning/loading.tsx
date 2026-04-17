export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-80 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
