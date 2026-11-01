export type TrendLayoutInput = { date: string; value: number };

export type TrendLayoutPoint = TrendLayoutInput & { x: number; y: number };

export function buildTrendChartLayout(
  series: TrendLayoutInput[],
  height: number,
  width = 400,
): {
  points: TrendLayoutPoint[];
  path: string;
  yMin: number;
  yMax: number;
  minLabel: string;
  maxLabel: string;
} | null {
  const pts = series.filter((p) => Number.isFinite(p.value));
  if (pts.length === 0) return null;

  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals, min + 1e-6);
  const pad = 28;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points: TrendLayoutPoint[] = pts.map((p, i) => {
    const x = pad + (innerW * i) / Math.max(1, pts.length - 1);
    const t = max === min ? 0.5 : (p.value - min) / (max - min);
    const y = pad + innerH * (1 - t);
    return { date: p.date, value: p.value, x, y };
  });

  const path =
    points.length > 1
      ? points
          .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(" ")
      : "";

  return {
    points,
    path,
    yMin: min,
    yMax: max,
    minLabel: pts[0]?.date.slice(0, 10) ?? "",
    maxLabel: pts[pts.length - 1]?.date.slice(0, 10) ?? "",
  };
}
