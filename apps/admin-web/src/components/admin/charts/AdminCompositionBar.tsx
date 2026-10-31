import { formatAdminCurrency } from "@/lib/adminFormatCurrency";

export function AdminCompositionBar({
  segments,
  showShare = false,
}: {
  segments: { label: string; value: number; colorClass: string }[];
  showShare?: boolean;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    return <p className="text-sm text-gray-500">No revenue in this window.</p>;
  }
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              className={s.colorClass}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${formatAdminCurrency(s.value)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 space-y-1 text-xs text-gray-600">
        {segments.map((s) => {
          const share = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li key={s.label} className="flex justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${s.colorClass}`} />
                {s.label}
              </span>
              <span className="shrink-0 tabular-nums font-medium text-gray-900">
                {formatAdminCurrency(s.value)}
                {showShare && s.value > 0 ? (
                  <span className="ml-1 font-normal text-gray-500">({share.toFixed(1)}%)</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
