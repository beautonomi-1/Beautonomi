/** Sanity bounds for ingested reference rates (reporting only). */

export function isUsdZarSane(rate: number): boolean {
  return rate > 5 && rate < 40;
}

export function isCcyZarSane(rate: number): boolean {
  return rate > 0.0001 && rate < 1000;
}

export function passesIngestSanity(base: string, quote: string, rate: number): boolean {
  if (rate <= 0 || !Number.isFinite(rate)) return false;
  const b = base.toUpperCase();
  const q = quote.toUpperCase();
  if (b === "USD" && q === "ZAR") return isUsdZarSane(rate);
  if (q === "ZAR") return isCcyZarSane(rate);
  return rate > 0 && rate < 1_000_000;
}
