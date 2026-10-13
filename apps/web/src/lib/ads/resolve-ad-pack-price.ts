export type AdPackPriceRow = {
  price_minor?: number | string | null;
  price_zar?: number | string | null;
  currency?: string | null;
};

/** Pack catalog amount in major currency units (e.g. ZAR rands). */
export function resolveAdPackAmountMajor(row: AdPackPriceRow): number {
  const minor = row.price_minor != null ? Number(row.price_minor) : NaN;
  if (Number.isFinite(minor) && minor >= 0) return minor / 100;
  const legacy = Number(row.price_zar ?? 0);
  return Number.isFinite(legacy) ? legacy : 0;
}

export function resolveAdPackCurrency(row: AdPackPriceRow, fallback = "ZAR"): string {
  const c = typeof row.currency === "string" ? row.currency.trim() : "";
  return c.length > 0 ? c : fallback;
}
