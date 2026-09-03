import type { SupabaseClient } from "@supabase/supabase-js";

export type CancellationFeeShareParams = {
  providerId: string;
  bookingId: string;
  /** The provider_earnings finance_transactions row created for the cancellation/no-show fee. */
  financeTransactionId: string;
  /** Provider's share of the fee (the provider_earnings amount). */
  providerEarningsAmount: number;
  tenantId?: string | null;
};

export type CancellationFeeShareResult = {
  enabled: boolean;
  linesCreated: number;
  totalShared: number;
};

type StaffLineInput = {
  staff_id: string;
  price: number;
  commission_enabled: boolean | null;
  rate: number;
};

/**
 * Pure split (unit-testable): proportional to each staff's service price on
 * the booking, at the staff commission rate.
 */
export function planCancellationFeeShareLines(
  inputs: StaffLineInput[],
  providerEarningsAmount: number,
): Array<{ staff_id: string; base_amount: number; rate: number; amount: number }> {
  const eligible = inputs.filter((i) => i.price > 0 && i.commission_enabled !== false && i.rate > 0);
  const totalPrice = eligible.reduce((s, i) => s + i.price, 0);
  if (totalPrice <= 0 || providerEarningsAmount <= 0) return [];
  const byStaff = new Map<string, { price: number; rate: number }>();
  for (const i of eligible) {
    const cur = byStaff.get(i.staff_id) ?? { price: 0, rate: i.rate };
    cur.price += i.price;
    cur.rate = Math.max(cur.rate, i.rate);
    byStaff.set(i.staff_id, cur);
  }
  const out: Array<{ staff_id: string; base_amount: number; rate: number; amount: number }> = [];
  for (const [staffId, v] of byStaff) {
    const base = Math.round((providerEarningsAmount * v.price / totalPrice) * 100) / 100;
    const amount = Math.round((base * v.rate / 100) * 100) / 100;
    if (amount > 0) out.push({ staff_id: staffId, base_amount: base, rate: v.rate, amount });
  }
  return out;
}

/**
 * Post `cancellation_fee_share` staff_earnings_lines when the provider setting
 * `provider_settings.staff_share_cancellation_fee` is on (default off).
 * Idempotent on UNIQUE(source_finance_transaction_id, staff_id, kind).
 *
 * Call site (owned by the cancellation settlement): right after the
 * cancellation / no-show fee `provider_earnings` finance_transactions row is
 * inserted — e.g. the cancel branch of PATCH /api/provider/bookings/[id] and
 * the no-show settlement helper — pass that FT id and amount.
 */
export async function postCancellationFeeShareLines(
  admin: SupabaseClient,
  params: CancellationFeeShareParams,
): Promise<CancellationFeeShareResult> {
  const { data: settings } = await admin
    .from("provider_settings")
    .select("staff_share_cancellation_fee")
    .eq("provider_id", params.providerId)
    .maybeSingle();
  const enabled = (settings as { staff_share_cancellation_fee?: boolean | null } | null)?.staff_share_cancellation_fee === true;
  if (!enabled) return { enabled: false, linesCreated: 0, totalShared: 0 };

  const { data: lines, error } = await admin
    .from("booking_services")
    .select("staff_id, price, provider_staff:staff_id(commission_enabled, commission_rate, service_commission_rate)")
    .eq("booking_id", params.bookingId)
    .not("staff_id", "is", null);
  if (error) throw error;

  const inputs: StaffLineInput[] = (lines ?? []).map((l: any) => {
    const ps = Array.isArray(l.provider_staff) ? l.provider_staff[0] : l.provider_staff;
    return {
      staff_id: l.staff_id as string,
      price: Number(l.price ?? 0),
      commission_enabled: ps?.commission_enabled ?? null,
      rate: Number(ps?.service_commission_rate ?? ps?.commission_rate ?? 0),
    };
  });

  const plan = planCancellationFeeShareLines(inputs, params.providerEarningsAmount);
  if (plan.length === 0) return { enabled: true, linesCreated: 0, totalShared: 0 };

  const rows = plan.map((p) => ({
    booking_id: params.bookingId,
    staff_id: p.staff_id,
    provider_id: params.providerId,
    tenant_id: params.tenantId ?? null,
    source_finance_transaction_id: params.financeTransactionId,
    kind: "cancellation_fee_share",
    base_amount: p.base_amount,
    rate: p.rate,
    amount: p.amount,
    rate_source: "staff",
    reason: "Cancellation / no-show fee share",
  }));

  const { data: inserted, error: insErr } = await admin
    .from("staff_earnings_lines")
    .upsert(rows, { onConflict: "source_finance_transaction_id,staff_id,kind", ignoreDuplicates: true })
    .select("id, amount");
  if (insErr) throw insErr;

  return {
    enabled: true,
    linesCreated: (inserted ?? []).length,
    totalShared: (inserted ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0),
  };
}
