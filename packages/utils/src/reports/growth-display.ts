export type GrowthKind = "up" | "down" | "flat" | "new";

export type GrowthResult = {
  kind: GrowthKind;
  /** Percent change when computable; null when kind is `new`. */
  percent: number | null;
};

/**
 * Compares current vs previous period values for report growth badges.
 * Prior period of zero with positive current → `new` (not a fake 100%+ spike).
 */
export function computeGrowthPercent(current: number, previous: number): GrowthResult {
  if (previous === 0) {
    if (current > 0) return { kind: "new", percent: null };
    return { kind: "flat", percent: 0 };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { kind: "flat", percent: 0 };
  return { kind: pct > 0 ? "up" : "down", percent: pct };
}

export function formatGrowthLabel(
  result: GrowthResult,
  opts: { decimals?: number; suffix?: string } = {}
): string {
  const { decimals = 1, suffix = "%" } = opts;
  if (result.kind === "new") return "New";
  if (result.kind === "flat" || result.percent === null) return `0${suffix}`;
  const sign = result.percent > 0 ? "+" : "";
  return `${sign}${result.percent.toFixed(decimals)}${suffix}`;
}

export function growthTrendColor(kind: GrowthKind): "green" | "red" | "gray" {
  if (kind === "up") return "green";
  if (kind === "down") return "red";
  return "gray";
}
