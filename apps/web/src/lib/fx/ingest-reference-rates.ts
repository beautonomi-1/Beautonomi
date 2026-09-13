import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchFrankfurterPairRate,
  fetchFrankfurterV2Batch,
  type FrankfurterV2Row,
} from "@/lib/fx/frankfurter-reference-rate";
import {
  extendedRateToZar,
  fetchExtendedUsdLatest,
} from "@/lib/fx/extended-reference-rate";
import { passesIngestSanity } from "@/lib/fx/fx-rate-sanity";
import { bustFxRateMemo } from "@/lib/fx/get-fx-rate";
import {
  allIngestTargets,
  HQ_REPORTING,
  loadFxPairBuckets,
  type FxPair,
  usdQuoteCodesForBatch,
} from "@/lib/fx/fx-pair-requirements";

export type IngestPairResult = {
  pair: string;
  ok: boolean;
  source?: string;
  rateDate?: string;
  reason?: string;
};

export type IngestFxRatesResult = {
  results: IngestPairResult[];
  requiredMissing: string[];
  stale: string[];
  warnings: string[];
  timeEolUnix?: number;
};

const STALE_DAYS = 7;
const BACKFILL_DAYS = 7;

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return utcDateString(d);
}

function pairLabel(p: FxPair): string {
  return `${p.base}/${p.quote}`;
}

async function hasAnyRow(supabase: SupabaseClient, p: FxPair): Promise<boolean> {
  const { count } = await supabase
    .from("fx_reference_rates")
    .select("id", { count: "exact", head: true })
    .eq("base_currency", p.base)
    .eq("quote_currency", p.quote);
  return (count ?? 0) > 0;
}

async function upsertApiRate(
  supabase: SupabaseClient,
  row: {
    rateDate: string;
    baseCurrency: string;
    quoteCurrency: string;
    rate: number;
    source: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!passesIngestSanity(row.baseCurrency, row.quoteCurrency, row.rate)) {
    return { ok: false, error: "sanity_check_failed" };
  }
  const { error } = await supabase.from("fx_reference_rates").upsert(
    {
      rate_date: row.rateDate,
      base_currency: row.baseCurrency,
      quote_currency: row.quoteCurrency,
      rate: row.rate,
      source: row.source,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "rate_date,base_currency,quote_currency,source" },
  );
  return { ok: !error, error: error?.message };
}

function deriveFromUsdBatch(
  rows: FrankfurterV2Row[],
  target: FxPair,
): { rateDate: string; rate: number } | null {
  const base = target.base;
  if (base === HQ_REPORTING) return { rateDate: utcDateString(new Date()), rate: 1 };

  const byDate = new Map<string, { zar?: number; base?: number }>();
  for (const r of rows) {
    if (r.base !== "USD") continue;
    const entry = byDate.get(r.date) ?? {};
    if (r.quote === "ZAR") entry.zar = r.rate;
    if (r.quote === base) entry.base = r.rate;
    byDate.set(r.date, entry);
  }

  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  for (const date of dates) {
    const entry = byDate.get(date);
    if (entry?.zar && entry.base && entry.base > 0) {
      const rate = entry.zar / entry.base;
      if (passesIngestSanity(base, HQ_REPORTING, rate)) {
        return { rateDate: date, rate };
      }
    }
  }
  return null;
}

async function ingestOnePairFrankfurter(
  supabase: SupabaseClient,
  target: FxPair,
  batchRows: FrankfurterV2Row[],
  warnings: string[],
): Promise<IngestPairResult> {
  const label = pairLabel(target);

  const derived = deriveFromUsdBatch(batchRows, target);
  if (derived) {
    const up = await upsertApiRate(supabase, {
      rateDate: derived.rateDate,
      baseCurrency: target.base,
      quoteCurrency: target.quote,
      rate: derived.rate,
      source: "frankfurter",
    });
    if (up.ok) {
      return {
        pair: label,
        ok: true,
        source: "frankfurter",
        rateDate: derived.rateDate,
      };
    }
    if (up.error === "sanity_check_failed") {
      warnings.push(`sanity_drop:${label}`);
    }
  }

  const direct = await fetchFrankfurterPairRate(target.base, target.quote);
  if (direct) {
    const up = await upsertApiRate(supabase, {
      rateDate: direct.rateDate,
      baseCurrency: direct.baseCurrency,
      quoteCurrency: direct.quoteCurrency,
      rate: direct.rate,
      source: direct.source,
    });
    if (up.ok) {
      return {
        pair: label,
        ok: true,
        source: direct.source,
        rateDate: direct.rateDate,
      };
    }
    if (up.error === "sanity_check_failed") {
      warnings.push(`sanity_drop:${label}`);
    }
    return { pair: label, ok: false, reason: up.error ?? "upsert_failed" };
  }

  return { pair: label, ok: false, reason: "frankfurter_miss" };
}

async function backfillPairIfEmpty(
  supabase: SupabaseClient,
  target: FxPair,
): Promise<void> {
  if (await hasAnyRow(supabase, target)) return;
  const from = daysAgo(BACKFILL_DAYS);
  const to = utcDateString(new Date());
  const quotes = usdQuoteCodesForBatch([target]);
  const rows = await fetchFrankfurterV2Batch("USD", quotes, { from, to });
  const derived = deriveFromUsdBatch(rows, target);
  if (derived) {
    await upsertApiRate(supabase, {
      rateDate: derived.rateDate,
      baseCurrency: target.base,
      quoteCurrency: target.quote,
      rate: derived.rate,
      source: "frankfurter",
    });
    return;
  }
  const direct = await fetchFrankfurterPairRate(target.base, target.quote);
  if (direct) {
    await upsertApiRate(supabase, {
      rateDate: direct.rateDate,
      baseCurrency: direct.baseCurrency,
      quoteCurrency: direct.quoteCurrency,
      rate: direct.rate,
      source: direct.source,
    });
  }
}

async function resolveLatestRateDate(
  supabase: SupabaseClient,
  p: FxPair,
): Promise<{ rateDate: string; source: string } | null> {
  const { data } = await supabase
    .from("fx_reference_rates")
    .select("rate_date, source")
    .eq("base_currency", p.base)
    .eq("quote_currency", p.quote)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.rate_date) return null;
  return {
    rateDate: String(data.rate_date),
    source: String((data as { source?: string }).source ?? "unknown"),
  };
}

function isStale(rateDate: string): boolean {
  const d = new Date(`${rateDate}T12:00:00.000Z`);
  const ageMs = Date.now() - d.getTime();
  return ageMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

export async function ingestFxReferenceRates(
  supabase: SupabaseClient,
  options?: { throwOnRequiredMissing?: boolean },
): Promise<IngestFxRatesResult> {
  const buckets = await loadFxPairBuckets(supabase);
  const targets = allIngestTargets(buckets);
  const results: IngestPairResult[] = [];
  const warnings: string[] = [];

  for (const p of targets) {
    await backfillPairIfEmpty(supabase, p);
  }

  const quotes = usdQuoteCodesForBatch(targets);
  const batchRows = await fetchFrankfurterV2Batch("USD", quotes);

  for (const p of targets) {
    results.push(await ingestOnePairFrankfurter(supabase, p, batchRows, warnings));
  }

  const stillMissing: FxPair[] = [];
  for (const p of buckets.required) {
    const latest = await resolveLatestRateDate(supabase, p);
    if (!latest) stillMissing.push(p);
  }

  let timeEolUnix = 0;
  if (stillMissing.length > 0) {
    const extended = await fetchExtendedUsdLatest();
    if (extended) {
      timeEolUnix = extended.timeEolUnix;
      if (extended.timeEolUnix > 0) {
        warnings.push(`ER-API time_eol_unix=${extended.timeEolUnix}`);
      }
      for (const p of stillMissing) {
        const derived = extendedRateToZar(extended.rates, p.base);
        if (!derived) {
          results.push({
            pair: pairLabel(p),
            ok: false,
            reason: "extended_miss",
          });
          continue;
        }
        const up = await upsertApiRate(supabase, {
          rateDate: extended.rateDate,
          baseCurrency: p.base,
          quoteCurrency: p.quote,
          rate: derived.rate,
          source: "open_er_api",
        });
        if (!up.ok && up.error === "sanity_check_failed") {
          warnings.push(`sanity_drop:${pairLabel(p)}`);
        }
        results.push({
          pair: pairLabel(p),
          ok: up.ok,
          source: up.ok ? "open_er_api" : undefined,
          rateDate: extended.rateDate,
          reason: up.ok ? undefined : up.error,
        });
      }
    } else {
      warnings.push("extended_api_unavailable");
    }
  }

  const requiredMissing: string[] = [];
  const stale: string[] = [];

  for (const p of buckets.required) {
    const latest = await resolveLatestRateDate(supabase, p);
    const label = pairLabel(p);
    if (!latest) {
      requiredMissing.push(label);
      continue;
    }
    if (isStale(latest.rateDate)) stale.push(label);
  }

  for (const p of buckets.watched) {
    const latest = await resolveLatestRateDate(supabase, p);
    if (!latest) {
      warnings.push(`watched_missing:${pairLabel(p)}`);
    } else if (isStale(latest.rateDate)) {
      warnings.push(`watched_stale:${pairLabel(p)}`);
    }
  }

  if (options?.throwOnRequiredMissing && requiredMissing.length > 0) {
    throw new Error(
      `fx_reference_rates missing required pairs: ${requiredMissing.join(", ")}`,
    );
  }

  bustFxRateMemo();

  return { results, requiredMissing, stale, warnings, timeEolUnix };
}
