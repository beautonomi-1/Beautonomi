export function AdminFunnelBars({
  steps,
}: {
  steps: { label: string; value: number; rate: number | null }[];
}) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s) => (
        <div key={s.label} className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{s.value}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-teal-600" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
          {s.rate != null ? (
            <p className="mt-2 text-xs text-gray-500">{s.rate}% from prior step</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
