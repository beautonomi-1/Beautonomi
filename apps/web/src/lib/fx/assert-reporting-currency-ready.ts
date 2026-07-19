import type { SupabaseClient } from "@supabase/supabase-js";

const REPORTING_BASE = "ZAR";

/**
 * Non-ZAR tenants require fx_reference_rates before money/reporting paths go live.
 */
export async function assertReportingCurrencyReady(
  supabase: SupabaseClient,
  currency: string,
  reportingCurrency: string = REPORTING_BASE,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const raw = currency.trim().toUpperCase();
  const reporting = reportingCurrency.trim().toUpperCase();
  if (raw === reporting) return { ok: true };

  const { data } = await supabase
    .from("fx_reference_rates")
    .select("rate")
    .eq("base_currency", raw)
    .eq("quote_currency", reporting)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.rate) {
    return {
      ok: false,
      code: "FX_REPORTING_NOT_READY",
      message: `Multi-currency reporting is not enabled for ${raw}. FX reference rate ${raw}→${reporting} is required.`,
    };
  }
  return { ok: true };
}
