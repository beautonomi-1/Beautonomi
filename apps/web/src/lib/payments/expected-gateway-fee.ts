/**
 * Config-driven gateway fee estimator.
 *
 * Reads `payment_gateway_fee_configs` (migration 727) and applies the same
 * formula as the DB `calculate_expected_fee()` function.  Used:
 *   - As a fallback when a charge path cannot report the real fee synchronously
 *     (e.g. saved-card add-on settled before the async webhook arrives).
 *   - In `/admin/fees` reconciliations to auto-compute expected fees from ledger.
 *   - In Phase 13 tests to verify the seeded Paystack ZA config is correct.
 *
 * No literals — all rate/threshold/VAT values come from the database config.
 * If no matching config row is found, 0 is returned (never throws).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type GatewayFeeOptions = {
  method?: string;    // e.g. 'card', 'capitec_pay', 'ozow_eft', 'bank_transfer'
  region?: string;    // 'local' | 'international' | '*'
  currency?: string;  // ISO 4217, e.g. 'ZAR'
  scope?: "transaction" | "transfer" | "payout";
};

type FeeConfigRow = {
  fee_type: string;
  fee_percentage: number | null;
  fee_fixed_amount: number | null;
  fixed_fee_waiver_below: number | null;
  vat_rate: number | null;
  fee_is_vat_exclusive: boolean | null;
  max_fee_amount: number | null;
};

/**
 * Returns the expected gateway fee in major currency units (e.g. Rands, not cents).
 * Falls back to 0 if no config row is found.
 *
 * @param supabase  Any Supabase client with read access to payment_gateway_fee_configs.
 * @param gateway   Gateway name, e.g. 'paystack'.
 * @param amount    Transaction amount in major currency units.
 * @param opts      Optional per-call overrides (method, region, currency, scope).
 */
export async function expectedGatewayFee(
  supabase: SupabaseClient,
  gateway: string,
  amount: number,
  opts: GatewayFeeOptions = {},
): Promise<number> {
  const method   = opts.method   ?? "*";
  const region   = opts.region   ?? "local";
  const currency = opts.currency ?? "ZAR";
  const scope    = opts.scope    ?? "transaction";

  // Best-match lookup: prefer specific method + region, fall back to wildcards.
  const { data, error } = await (supabase.from("payment_gateway_fee_configs") as any)
    .select(
      "fee_type, fee_percentage, fee_fixed_amount, fixed_fee_waiver_below, " +
      "vat_rate, fee_is_vat_exclusive, max_fee_amount, payment_method, region",
    )
    .eq("gateway_name", gateway)
    .eq("currency", currency)
    .eq("fee_scope", scope)
    .eq("is_active", true)
    .or(`payment_method.eq.${method},payment_method.eq.*`)
    .or(`region.eq.${region},region.eq.*`)
    .is("effective_until", null)
    .lte("effective_from", new Date().toISOString())
    .order("payment_method", { ascending: true }) // specific before wildcard
    .order("region", { ascending: true })
    .order("effective_from", { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) return 0;

  // Pick the most-specific config: prefer exact method/region over wildcards.
  const cfg = (data as (FeeConfigRow & { payment_method: string; region: string })[])
    .sort((a, b) => {
      const aScore = (a.payment_method === method ? 0 : 1) + (a.region === region ? 0 : 1);
      const bScore = (b.payment_method === method ? 0 : 1) + (b.region === region ? 0 : 1);
      return aScore - bScore;
    })[0];

  const pct   = Number(cfg.fee_percentage ?? 0);
  const fixed = Number(cfg.fee_fixed_amount ?? 0);
  const waiver = cfg.fixed_fee_waiver_below != null ? Number(cfg.fixed_fee_waiver_below) : null;
  const vatRate = Number(cfg.vat_rate ?? 0);
  const vatExclusive = cfg.fee_is_vat_exclusive !== false;
  const cap = cfg.max_fee_amount != null ? Number(cfg.max_fee_amount) : null;

  // Percentage component
  let computed = amount * pct;

  // Fixed component — waived when amount is below the waiver threshold
  if (waiver === null || amount >= waiver) {
    computed += fixed;
  }

  // Apply cap
  if (cap !== null) {
    computed = Math.min(computed, cap);
  }

  // Apply VAT if quoted rate is VAT-exclusive
  if (vatExclusive && vatRate > 0) {
    computed *= 1 + vatRate;
  }

  return Math.round(computed * 100) / 100;
}
