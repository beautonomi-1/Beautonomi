/**
 * Waitlist → booking money. Offerings are a single line, no travel/tip/promo.
 * Totals must satisfy validate_booking_total (10142) on insert.
 */
import {
  calculateBookingTotals,
  expectedPersistedBookingTotal,
} from "@beautonomi/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  providerVatSnapshotColumns,
  resolveProviderVat,
  type ResolvedProviderVat,
} from "@/lib/tax/resolve-provider-vat";

export type WaitlistBookingMoney = {
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  tax_inclusive: boolean;
  total_amount: number;
  discount_amount: number;
  promotion_discount_amount: number;
  membership_discount_amount: number;
  travel_fee: number;
  tip_amount: number;
  platform_fee_amount: number;
  service_fee_amount: number;
  currency: string;
  provider_vat_number_snapshot: string | null;
};

export function waitlistBookingMoney(input: {
  servicePrice: number;
  currency: string;
  vat: ResolvedProviderVat;
}): WaitlistBookingMoney {
  const subtotal = Math.max(0, Number(input.servicePrice) || 0);
  const ratePercent = input.vat.registered ? input.vat.ratePercent : 0;
  const totals = calculateBookingTotals({
    subtotal,
    discountAmount: 0,
    taxRate: ratePercent / 100,
    taxInclusive: input.vat.inclusive,
    travelFee: 0,
    platformFeePercentage: 0,
    tipAmount: 0,
    currency: input.currency,
  });
  const snapshot = providerVatSnapshotColumns(input.vat);
  const row: WaitlistBookingMoney = {
    subtotal: totals.subtotal,
    tax_amount: totals.taxAmount,
    tax_rate: ratePercent,
    tax_inclusive: snapshot.tax_inclusive,
    total_amount: totals.totalAmount,
    discount_amount: 0,
    promotion_discount_amount: 0,
    membership_discount_amount: 0,
    travel_fee: 0,
    tip_amount: 0,
    platform_fee_amount: 0,
    service_fee_amount: 0,
    currency: input.currency,
    provider_vat_number_snapshot: snapshot.provider_vat_number_snapshot,
  };
  // Guard: never persist a total the 10142 trigger would reject.
  const expected = expectedPersistedBookingTotal({
    subtotal: row.subtotal,
    taxAmount: row.tax_amount,
    taxInclusive: row.tax_inclusive,
    serviceFeeAmount: row.service_fee_amount,
    travelFee: row.travel_fee,
    tipAmount: row.tip_amount,
    currency: row.currency,
  });
  if (Math.abs(expected - row.total_amount) > 0.01) {
    row.total_amount = expected;
  }
  return row;
}

/**
 * Payload for `create_booking_with_locking` (10143 persists tax_inclusive /
 * tax_rate / VAT snapshot / platform_fee on insert).
 */
export function waitlistBookingRpcInsertMoney(money: WaitlistBookingMoney): WaitlistBookingMoney {
  return { ...money };
}

export async function resolveWaitlistProviderVat(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ResolvedProviderVat> {
  const { data } = await supabase
    .from("providers")
    .select("tax_rate_percent, tax_inclusive, is_vat_registered, vat_number, tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  return resolveProviderVat(supabase, {
    tax_rate_percent: (data as { tax_rate_percent?: number | null } | null)?.tax_rate_percent ?? null,
    tax_inclusive: (data as { tax_inclusive?: boolean | null } | null)?.tax_inclusive ?? null,
    is_vat_registered: (data as { is_vat_registered?: boolean | null } | null)?.is_vat_registered ?? null,
    vat_number: (data as { vat_number?: string | null } | null)?.vat_number ?? null,
    tenant_id: (data as { tenant_id?: string | null } | null)?.tenant_id ?? null,
    tax_rate_override_percent: null,
  });
}
