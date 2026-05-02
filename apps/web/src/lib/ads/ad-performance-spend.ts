/**
 * Pure helpers for GET /api/provider/ads/performance spend attribution.
 * CPC / impression packs debit `spent` via DB triggers; time-based is prepaid (budget) without per-impression debit.
 */

export type AdsCampaignSpendRow = {
  billing_model?: string | null;
  status?: string | null;
  budget?: unknown;
  spent?: unknown;
  start_at?: string | null;
  end_at?: string | null;
};

/** Lifetime spend shown in dashboards: CPC/pack use `spent`; time-based uses prepaid `budget` after payment. */
export function effectiveLifetimeSpendRow(c: AdsCampaignSpendRow): number {
  const bm = String(c.billing_model ?? "cpc_budget");
  const spent = Number(c.spent ?? 0);
  const budget = Number(c.budget ?? 0);
  if (bm === "time_based") {
    const status = String(c.status ?? "");
    if (status === "draft") return 0;
    return budget > 0 ? budget : spent;
  }
  return spent;
}

export function filterRangeMsFromParams(startDate?: string, endDate?: string): { startMs: number; endMs: number } {
  const startMs = startDate
    ? new Date(startDate.includes("T") ? startDate : `${startDate}T00:00:00.000Z`).getTime()
    : 0;
  const endMs = endDate
    ? new Date(endDate.includes("T") ? endDate : `${endDate}T23:59:59.999Z`).getTime()
    : 8.64e15;
  return {
    startMs: Number.isFinite(startMs) ? startMs : 0,
    endMs: Number.isFinite(endMs) ? Math.max(endMs, Number.isFinite(startMs) ? startMs : 0) : 8.64e15,
  };
}

export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  return Math.max(0, hi - lo);
}

/** Attribute prepaid time-based budget across the campaign window when filtering by dates. */
export function timeBasedAttributedSpend(c: AdsCampaignSpendRow, range: { startMs: number; endMs: number }): number {
  if (String(c.billing_model ?? "") !== "time_based") return 0;
  const prepaid = effectiveLifetimeSpendRow(c);
  if (prepaid <= 0) return 0;
  const rawStart = c.start_at ? new Date(String(c.start_at)).getTime() : NaN;
  const rawEnd = c.end_at ? new Date(String(c.end_at)).getTime() : NaN;
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) return 0;
  const ov = overlapMs(range.startMs, range.endMs, rawStart, rawEnd);
  if (ov <= 0) return 0;
  const span = rawEnd - rawStart;
  return Math.min(prepaid, prepaid * (ov / span));
}
