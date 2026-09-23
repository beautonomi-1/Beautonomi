import { useMemo } from "react";
import { formatAdminCurrency, formatAdminNumber } from "@/lib/adminFormatCurrency";

export type TrendPoint = { date: string; value: number; label?: string };

export function AdminTrendChart({
  series,
  valueFormat = "number",
  emptyMessage = "Not enough data in this range.",
  height = 120,
}: {
  series: TrendPoint[];
  valueFormat?: "number" | "currency" | "percent";
  emptyMessage?: string;
  height?: number;
}) {
  const { path, minLabel, maxLabel, latest, prior } = useMemo(() => {
    const pts = series.filter((p) => Number.isFinite(p.value));
    if (pts.length === 0) {
      return { path: "", minLabel: "", maxLabel: "", latest: 0, prior: 0 };
    }
    const vals = pts.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals, min + 1e-6);
    const w = 400;
    const h = height;
    const pad = 28;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const d = vals
      .map((v, i) => {
        const x = pad + (innerW * i) / Math.max(1, vals.length - 1);
        const t = max === min ? 0.5 : (v - min) / (max - min);
        const y = pad + innerH * (1 - t);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return {
      path: d,
      minLabel: pts[0]?.date.slice(0, 10) ?? "",
      maxLabel: pts[pts.length - 1]?.date.slice(0, 10) ?? "",
      latest: vals[vals.length - 1] ?? 0,
      prior: vals.length > 1 ? vals[vals.length - 2] ?? 0 : vals[0] ?? 0,
    };
  }, [series, height]);

  const fmt = (n: number) => {
    if (valueFormat === "currency") return formatAdminCurrency(n);
    if (valueFormat === "percent") return `${(n * 100).toFixed(1)}%`;
    return formatAdminNumber(n);
  };

  if (series.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }

  const direction = latest >= prior ? "up" : "down";

  return (
    <div>
      <svg viewBox={`0 0 400 ${height}`} className="h-auto w-full max-w-xl text-gray-900" role="img">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <text x="28" y={height - 4} className="fill-gray-400 text-[10px]">
          {minLabel}
        </text>
        <text x="360" y={height - 4} textAnchor="end" className="fill-gray-400 text-[10px]">
          {maxLabel}
        </text>
      </svg>
      <p className="mt-2 text-xs text-gray-600">
        Latest {fmt(latest)}
        {series.length > 1 ? (
          <span className={direction === "up" ? " text-emerald-700" : " text-rose-700"}>
            {" "}
            ({direction === "up" ? "up" : "down"} from {fmt(prior)})
          </span>
        ) : null}
      </p>
    </div>
  );
}
