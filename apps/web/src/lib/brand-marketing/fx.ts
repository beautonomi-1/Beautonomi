import type { SupabaseClient } from "@supabase/supabase-js";

export async function convertAmount(
  supabase: SupabaseClient,
  rawAmount: number,
  rawCurrency: string,
  reportingCurrency: string,
  asOfDate: string,
): Promise<{ converted: number | null; missingRate: boolean }> {
  if (rawCurrency.toUpperCase() === reportingCurrency.toUpperCase()) {
    return { converted: rawAmount, missingRate: false };
  }
  const { data, error } = await supabase.rpc("convert_to_reporting_amount", {
    p_raw_amount: rawAmount,
    p_raw_currency: rawCurrency.toUpperCase(),
    p_reporting_currency: reportingCurrency.toUpperCase(),
    p_rate_date: asOfDate,
  });
  if (error || data == null) return { converted: null, missingRate: true };
  return { converted: Number(data), missingRate: false };
}
