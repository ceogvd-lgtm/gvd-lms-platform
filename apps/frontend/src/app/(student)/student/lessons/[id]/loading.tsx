export default function Loading() {
  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-6">
      <div className="h-10 w-3/4 animate-pulse rounded-button bg-surface-2" />
      <div className="h-80 animate-pulse rounded-card bg-surface-2" />
      <div className="h-40 animate-pulse rounded-card bg-surface-2" />
    </div>
  );
}
