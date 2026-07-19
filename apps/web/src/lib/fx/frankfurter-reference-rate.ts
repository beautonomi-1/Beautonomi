/**
 * Daily reference FX rates (Frankfurter / ECB). Reporting and GL only — never used to charge customers.
 * @see https://frankfurter.dev/
 */

export type FxReferenceRate = {
  rateDate: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: "frankfurter";
};

const FRANKFURTER_BASE =
  process.env.FRANKFURTER_API_BASE?.trim() || "https://api.frankfurter.dev";

export async function fetchFrankfurterRate(
  baseCurrency: string,
  quoteCurrency: string,
  rateDate?: string,
): Promise<FxReferenceRate | null> {
  const base = baseCurrency.trim().toUpperCase();
  const quote = quoteCurrency.trim().toUpperCase();
  if (base === quote) {
    return {
      rateDate: rateDate ?? new Date().toISOString().slice(0, 10),
      baseCurrency: base,
      quoteCurrency: quote,
      rate: 1,
      source: "frankfurter",
    };
  }

  const path = rateDate
    ? `/v1/${rateDate}?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`
    : `/v1/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`;

  const res = await fetch(`${FRANKFURTER_BASE}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86_400 },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    date?: string;
    rates?: Record<string, number>;
  };
  const rate = body.rates?.[quote];
  if (typeof rate !== "number" || rate <= 0) return null;

  return {
    rateDate: body.date ?? rateDate ?? new Date().toISOString().slice(0, 10),
    baseCurrency: base,
    quoteCurrency: quote,
    rate,
    source: "frankfurter",
  };
}
