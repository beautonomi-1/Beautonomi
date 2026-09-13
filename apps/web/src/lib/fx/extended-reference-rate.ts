/**
 * ExchangeRate-API open access (no key). Fallback only when Frankfurter misses a pair.
 * @see https://www.exchangerate-api.com/docs/free
 */

export type ExtendedUsdRates = {
  rateDate: string;
  source: "open_er_api";
  rates: Record<string, number>;
  timeEolUnix: number;
};

const EXTENDED_BASE =
  process.env.FX_EXTENDED_API_BASE?.trim() || "https://open.er-api.com";

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchExtendedUsdLatest(): Promise<ExtendedUsdRates | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${EXTENDED_BASE}/v6/latest/USD`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (body.result !== "success") return null;
    if (body.base_code !== "USD") return null;
    const rawRates = body.rates;
    if (!rawRates || typeof rawRates !== "object") return null;

    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(rawRates as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) rates[code.toUpperCase()] = n;
    }

    const unix =
      typeof body.time_last_update_unix === "number"
        ? body.time_last_update_unix
        : Math.floor(Date.now() / 1000);
    const rateDate = new Date(unix * 1000).toISOString().slice(0, 10);
    const timeEolUnix = typeof body.time_eol_unix === "number" ? body.time_eol_unix : 0;

    return { rateDate, source: "open_er_api", rates, timeEolUnix };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Derive {ccy}→ZAR from USD pivot: ZAR_per_USD / ccy_per_USD */
export function extendedRateToZar(
  rates: Record<string, number>,
  baseCurrency: string,
): { rate: number } | null {
  const base = baseCurrency.trim().toUpperCase();
  const zarPerUsd = rates.ZAR;
  const basePerUsd = rates[base];
  if (!zarPerUsd || !basePerUsd || basePerUsd <= 0) return null;
  if (base === "ZAR") return { rate: 1 };
  return { rate: zarPerUsd / basePerUsd };
}
