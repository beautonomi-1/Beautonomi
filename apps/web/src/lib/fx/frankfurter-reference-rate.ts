/**
 * Frankfurter v2 reference FX rates. Reporting and GL only — never used to charge customers.
 * @see https://frankfurter.dev/
 */

export type FxReferenceRate = {
  rateDate: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: "frankfurter";
};

export type FrankfurterV2Row = {
  date: string;
  base: string;
  quote: string;
  rate: number;
};

const FRANKFURTER_BASE =
  process.env.FRANKFURTER_API_BASE?.trim() || "https://api.frankfurter.dev";

const FETCH_TIMEOUT_MS = 10_000;

async function frankfurterFetch(path: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${FRANKFURTER_BASE}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseV2Rows(body: unknown): FrankfurterV2Row[] {
  if (!Array.isArray(body)) return [];
  const rows: FrankfurterV2Row[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : null;
    const base = typeof row.base === "string" ? row.base.toUpperCase() : null;
    const quote = typeof row.quote === "string" ? row.quote.toUpperCase() : null;
    const rate = typeof row.rate === "number" ? row.rate : null;
    if (!date || !base || !quote || rate == null || rate <= 0) continue;
    rows.push({ date, base, quote, rate });
  }
  return rows;
}

/** Latest or historical batch: GET /v2/rates?base=&quotes= */
export async function fetchFrankfurterV2Batch(
  baseCurrency: string,
  quoteCurrencies: string[],
  options?: { from?: string; to?: string },
): Promise<FrankfurterV2Row[]> {
  const base = baseCurrency.trim().toUpperCase();
  const quotes = [...new Set(quoteCurrencies.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (quotes.length === 0) return [];

  const params = new URLSearchParams();
  params.set("base", base.toLowerCase());
  params.set("quotes", quotes.map((q) => q.toLowerCase()).join(","));
  if (options?.from) params.set("from", options.from);
  if (options?.to) params.set("to", options.to);

  const res = await frankfurterFetch(`/v2/rates?${params.toString()}`);
  if (!res?.ok) return [];
  try {
    return parseV2Rows(await res.json());
  } catch {
    return [];
  }
}

/** Single pair: GET /v2/rate/{base}/{quote} */
export async function fetchFrankfurterPairRate(
  baseCurrency: string,
  quoteCurrency: string,
): Promise<FxReferenceRate | null> {
  const base = baseCurrency.trim().toUpperCase();
  const quote = quoteCurrency.trim().toUpperCase();
  if (base === quote) {
    return {
      rateDate: new Date().toISOString().slice(0, 10),
      baseCurrency: base,
      quoteCurrency: quote,
      rate: 1,
      source: "frankfurter",
    };
  }

  const res = await frankfurterFetch(
    `/v2/rate/${encodeURIComponent(base.toLowerCase())}/${encodeURIComponent(quote.toLowerCase())}`,
  );
  if (!res?.ok) return null;
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const rate = typeof body.rate === "number" ? body.rate : null;
    if (rate == null || rate <= 0) return null;
    const rateDate =
      typeof body.date === "string"
        ? body.date
        : new Date().toISOString().slice(0, 10);
    return {
      rateDate,
      baseCurrency: base,
      quoteCurrency: quote,
      rate,
      source: "frankfurter",
    };
  } catch {
    return null;
  }
}

/** @deprecated Use fetchFrankfurterPairRate / fetchFrankfurterV2Batch (v2). Kept for tests importing the old name. */
export async function fetchFrankfurterRate(
  baseCurrency: string,
  quoteCurrency: string,
  rateDate?: string,
): Promise<FxReferenceRate | null> {
  if (rateDate) {
    const rows = await fetchFrankfurterV2Batch(baseCurrency, [quoteCurrency], {
      from: rateDate,
      to: rateDate,
    });
    const match = rows.find(
      (r) =>
        r.base === baseCurrency.toUpperCase() &&
        r.quote === quoteCurrency.toUpperCase(),
    );
    if (!match) return null;
    return {
      rateDate: match.date,
      baseCurrency: match.base,
      quoteCurrency: match.quote,
      rate: match.rate,
      source: "frankfurter",
    };
  }
  return fetchFrankfurterPairRate(baseCurrency, quoteCurrency);
}
