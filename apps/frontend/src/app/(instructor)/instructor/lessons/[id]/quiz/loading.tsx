export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-button bg-surface-2" />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr_300px]">
        <div className="h-[560px] animate-pulse rounded-card bg-surface-2" />
        <div className="h-[560px] animate-pulse rounded-card bg-surface-2" />
        <div className="h-[560px] animate-pulse rounded-card bg-surface-2" />
      </div>
    </div>
  );
}
