import { useMemo, useState } from "react";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";
import { buildTrendChartLayout } from "./adminTrendChartLayout";

export type TrendPoint = { date: string; value: number; label?: string };

function formatTrendDate(iso: string): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split("-");
  return `${y}-${m}-${day}`;
}

export function AdminTrendChart({
  series,
  valueFormat = "number",
  emptyMessage = "Not enough data in this range.",
  height = 120,
  label = "Trend over time",
}: {
  series: TrendPoint[];
  valueFormat?: "number" | "currency" | "percent";
  emptyMessage?: string;
  height?: number;
  /** Accessible name for the sparkline. */
  label?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const layout = useMemo(() => buildTrendChartLayout(series, height), [series, height]);

  const fmt = (n: number) => {
    if (valueFormat === "currency") return formatAdminCurrency(n);
    if (valueFormat === "percent") return `${(n * 100).toFixed(1)}%`;
    return formatAdminNumber(n);
  };

  if (series.length === 0 || !layout) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  const { points, path, yMin, yMax, minLabel, maxLabel } = layout;
  const focusIndex = activeIndex ?? points.length - 1;
  const focus = points[focusIndex];
  const prior = focusIndex > 0 ? points[focusIndex - 1] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 400 ${height}`}
        className="h-auto w-full max-w-xl text-gray-900"
        role="img"
        aria-label={label}
        onMouseLeave={() => setActiveIndex(null)}
      >
        <text x="4" y="14" className="fill-gray-400 text-[9px]">
          {fmt(yMax)}
        </text>
        <text x="4" y={height - 18} className="fill-gray-400 text-[9px]">
          {fmt(yMin)}
        </text>
        {path ? (
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        ) : null}
        {points.map((p, i) => {
          const isActive = focusIndex === i;
          return (
            <g key={`${p.date}-${i}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                className="cursor-pointer fill-transparent"
                onMouseEnter={() => setActiveIndex(i)}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? 4 : 2.5}
                className={`pointer-events-none fill-current ${isActive ? "opacity-100" : "opacity-40"}`}
              />
              <title>{`${formatTrendDate(p.date)}: ${fmt(p.value)}`}</title>
            </g>
          );
        })}
        <text x="28" y={height - 4} className="fill-gray-400 text-[10px]">
          {minLabel}
        </text>
        <text x="360" y={height - 4} textAnchor="end" className="fill-gray-400 text-[10px]">
          {maxLabel}
        </text>
      </svg>
      <p className="mt-2 text-xs text-gray-600">
        {activeIndex != null ? (
          <>
            <span className="font-medium text-gray-900">{formatTrendDate(focus.date)}</span>
            {" · "}
            {fmt(focus.value)}
            {prior ? (
              <span className="text-gray-500"> · vs previous point {fmt(prior.value)}</span>
            ) : null}
          </>
        ) : (
          <>
            Latest {fmt(focus.value)}
            {prior ? (
              <span className="text-gray-500"> · vs previous point {fmt(prior.value)}</span>
            ) : null}
            {points.length > 1 ? (
              <span className="text-gray-400"> · Hover points for daily values</span>
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}
