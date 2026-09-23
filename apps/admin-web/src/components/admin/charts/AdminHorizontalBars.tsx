import { formatAdminNumber } from "@/lib/adminFormatCurrency";

export function AdminHorizontalBars({
  rows,
  emptyMessage = "No data.",
}: {
  rows: { label: string; value: number; hint?: string }[];
  emptyMessage?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2 text-xs text-gray-600">
            <span className="min-w-0 truncate capitalize">{r.label.replace(/_/g, " ")}</span>
            <span className="shrink-0 tabular-nums font-medium text-gray-900">
              {formatAdminNumber(r.value)}
              {r.hint ? ` ${r.hint}` : ""}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-gray-900 transition-[width]"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
