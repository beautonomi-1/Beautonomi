/** Keep in sync with apps/web booking-status enum contract. */
export const BOOKING_STATUS_ORDER = [
  "pending",
  "pending_payment",
  "confirmed",
  "in_progress",
  "waiting",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "1y";

export type TimeSeriesPoint = { date: string; count?: number; revenue?: number };

export type RevenueStreamsPayload = {
  booking_commission?: number;
  subscriptions?: number;
  ads?: number;
  service_fees?: number;
  marketing_credits?: number;
  gift_card_breakage?: number;
};

export function sumTimeSeriesCount(points: TimeSeriesPoint[]): number {
  return points.reduce((s, p) => s + (p.count ?? 0), 0);
}

export function sumTimeSeriesRevenue(points: Array<{ revenue?: number }>): number {
  return points.reduce((s, p) => s + (p.revenue ?? 0), 0);
}

export function periodDaysLabel(period: AnalyticsPeriod): string {
  switch (period) {
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
    case "90d":
      return "90 days";
    case "1y":
      return "1 year";
    default:
      return period;
  }
}

export function healthDeltaLabel(period: AnalyticsPeriod): string {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "1y" ? 365 : 30;
  return `vs snapshot ${days} days earlier`;
}

export function deltaPct(
  current: number | null | undefined,
  prior: number | null | undefined,
): number | null {
  if (current == null || prior == null || prior === 0) {
    if (current != null && prior === 0 && current > 0) return 100;
    return null;
  }
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

export function formatDeltaHint(d: number | null | undefined, period: AnalyticsPeriod): string {
  if (d == null) return healthDeltaLabel(period);
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d}% ${healthDeltaLabel(period)}`;
}

export function buildRevenueMixSegments(streams: RevenueStreamsPayload | undefined) {
  if (!streams) return [];
  return [
    { label: "Booking take", value: streams.booking_commission ?? 0, colorClass: "bg-emerald-600" },
    { label: "Subscriptions", value: streams.subscriptions ?? 0, colorClass: "bg-violet-600" },
    { label: "Ads", value: streams.ads ?? 0, colorClass: "bg-amber-500" },
    { label: "Marketing credits", value: streams.marketing_credits ?? 0, colorClass: "bg-sky-600" },
    { label: "Platform fees", value: streams.service_fees ?? 0, colorClass: "bg-slate-600" },
    { label: "Gift card breakage", value: streams.gift_card_breakage ?? 0, colorClass: "bg-rose-600" },
  ];
}

export function mixTotal(segments: { value: number }[]): number {
  return segments.reduce((s, x) => s + Math.max(0, x.value), 0);
}

export function shareOfTotal(value: number, total: number): number | null {
  if (total <= 0) return null;
  return (value / total) * 100;
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type BookingStatusCounts = Record<string, number> & { scheduled_total?: number; other?: number };

export function bookingStatusBarRows(breakdown: BookingStatusCounts) {
  const rows: { label: string; value: number }[] = [];
  for (const status of BOOKING_STATUS_ORDER) {
    const v = breakdown[status] ?? 0;
    if (v > 0) rows.push({ label: formatStatusLabel(status), value: v });
  }
  const other = breakdown.other ?? 0;
  if (other > 0) rows.push({ label: "Other", value: other });
  return rows;
}

export function qualityShareSentence(
  breakdown: BookingStatusCounts,
): { cancelPct: string; noShowPct: string } | null {
  const total = breakdown.scheduled_total ?? 0;
  if (total <= 0) return null;
  const cancelled = breakdown.cancelled ?? 0;
  const noShow = breakdown.no_show ?? 0;
  return {
    cancelPct: `${((cancelled / total) * 100).toFixed(1)}%`,
    noShowPct: `${((noShow / total) * 100).toFixed(1)}%`,
  };
}

export function fmtPctRate(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function reportLinkWithPeriod(basePath: string, period: string): string {
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}period=${encodeURIComponent(period)}`;
}
