import type { SupabaseClient } from "@supabase/supabase-js";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * Resolve the ISO 4217 currency for a finance_transactions row.
 *
 * Order: explicit hint → tenants.default_currency (via tenant id) → last-resort.
 * Migration 870 also installs a BEFORE INSERT trigger
 * (`finance_transactions_default_currency`) that performs the same tenant lookup
 * when `currency` is NULL, so this helper is defence in depth for writers that
 * want the value in-process (tests, downstream metadata, notifications).
 *
 * Never throws — a lookup failure falls back to the last-resort currency.
 */
export async function resolveLedgerCurrency(
  supabase: SupabaseClient,
  input: { currency?: string | null; tenantId?: string | null },
): Promise<string> {
  const hint = typeof input.currency === "string" ? input.currency.trim() : "";
  if (hint) return hint;

  const tenantId = typeof input.tenantId === "string" ? input.tenantId.trim() : "";
  if (!tenantId) return LAST_RESORT_CURRENCY;

  try {
    const { data } = await supabase
      .from("tenants")
      .select("default_currency")
      .eq("id", tenantId)
      .maybeSingle();
    const value = (data as { default_currency?: string | null } | null)?.default_currency;
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // fall through to last resort
  }
  return LAST_RESORT_CURRENCY;
}
