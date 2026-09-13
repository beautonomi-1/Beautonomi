import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveReportingRate, isFxRateStale } from "@/lib/fx/resolve-reporting-rate";
import { bustFxRateMemo } from "@/lib/fx/get-fx-rate";

const REPORTING_BASE = "ZAR";

export type ReportingCurrencyReadyResult =
  | { ok: true; rateDate?: string; source?: string; stale?: boolean }
  | { ok: false; code: string; message: string; stale?: boolean; rateDate?: string; source?: string };

/**
 * Non-ZAR charge currencies require a resolvable FX reference rate before money paths go live.
 * Checkout: fails only when missing (not stale). Launch uses checkReportingCurrencyFreshness.
 */
export async function assertReportingCurrencyReady(
  _supabase: SupabaseClient,
  currency: string,
  reportingCurrency: string = REPORTING_BASE,
): Promise<ReportingCurrencyReadyResult> {
  const raw = currency.trim().toUpperCase();
  const reporting = reportingCurrency.trim().toUpperCase();
  if (raw === reporting) return { ok: true };

  const resolved = await resolveReportingRate({ base: raw, quote: reporting });
  if (resolved.rate == null || !Number.isFinite(resolved.rate)) {
    return {
      ok: false,
      code: "FX_REPORTING_NOT_READY",
      message: `Multi-currency reporting is not enabled for ${raw}. FX reference rate ${raw}→${reporting} is required.`,
    };
  }

  return {
    ok: true,
    rateDate: resolved.rateDate,
    source: resolved.source,
    stale: isFxRateStale(resolved.rateDate),
  };
}

/** Launch / admin freshness — fails when missing or older than 7 days. */
export async function checkReportingCurrencyFreshness(
  currency: string,
  reportingCurrency: string = REPORTING_BASE,
): Promise<ReportingCurrencyReadyResult> {
  const raw = currency.trim().toUpperCase();
  const reporting = reportingCurrency.trim().toUpperCase();
  if (raw === reporting) return { ok: true };

  const resolved = await resolveReportingRate({ base: raw, quote: reporting });
  if (resolved.rate == null || !Number.isFinite(resolved.rate)) {
    return {
      ok: false,
      code: "FX_REPORTING_NOT_READY",
      message: `Missing FX reference rate ${raw}→${reporting}.`,
    };
  }

  const stale = isFxRateStale(resolved.rateDate);
  if (stale) {
    return {
      ok: false,
      code: "FX_REPORTING_STALE",
      message: `FX reference rate ${raw}→${reporting} is stale (last: ${resolved.rateDate ?? "?"}, source: ${resolved.source}).`,
      stale: true,
      rateDate: resolved.rateDate,
      source: resolved.source,
    };
  }

  return {
    ok: true,
    rateDate: resolved.rateDate,
    source: resolved.source,
    stale: false,
  };
}

export { bustFxRateMemo };
