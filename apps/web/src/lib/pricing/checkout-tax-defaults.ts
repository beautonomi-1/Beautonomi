/**
 * Default VAT/tax when the provider has no explicit tax_rate_percent — same path as
 * `validate-booking.ts` (platform default rate + reference_data inclusive flag).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformDefaultTaxRate } from "@/lib/platform-tax-settings";

export interface PlatformDefaultTaxSettings {
  taxRate: number;
  /** When true, prices are tax-inclusive (extract VAT, do not add on top). */
  taxIncluded: boolean;
}

/**
 * @param supabaseAdmin — service-role client for `reference_data` (matches validate-booking).
 */
export async function getPlatformDefaultTaxRateAndInclusive(
  supabaseAdmin: SupabaseClient,
): Promise<PlatformDefaultTaxSettings> {
  const taxRate = await getPlatformDefaultTaxRate();
  let taxIncluded = false;

  try {
    const { data: taxRefRow } = await supabaseAdmin
      .from("reference_data")
      .select("metadata")
      .eq("type", "tax_rate")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (taxRefRow?.metadata && typeof taxRefRow.metadata === "object") {
      const meta = taxRefRow.metadata as Record<string, unknown>;
      if (meta.included === true) taxIncluded = true;
    }
  } catch {
    // Non-critical; default to exclusive tax
  }

  return { taxRate, taxIncluded };
}
