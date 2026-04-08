export function AdminPageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-8 w-1/3 rounded bg-gray-200" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded bg-gray-100" />
      ))}
    </div>
  );
}
