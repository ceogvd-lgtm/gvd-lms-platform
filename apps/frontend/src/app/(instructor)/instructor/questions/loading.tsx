export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-9 w-64 animate-pulse rounded-button bg-surface-2" />
      <div className="h-28 animate-pulse rounded-card bg-surface-2" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
