import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, percentOf, roundCurrency } from "@beautonomi/utils";
import { pooledShare } from "./commission-calculator";
import { resolveStaffRates } from "./resolve-staff-rates";
import { insertStaffEarningsLinesIgnoreDuplicates } from "./insert-staff-earnings-lines";

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
 * Pure split: proportional to each staff member's service price, at that
 * person's service rate. A complimentary service has no price, so the booked
 * stylists share the fee equally. A priced service beside a complimentary one
 * still takes the fee by price.
 */
export function planCancellationFeeShareLines(
  inputs: StaffLineInput[],
  providerEarningsAmount: number,
): Array<{ staff_id: string; base_amount: number; rate: number; amount: number }> {
  if (providerEarningsAmount <= 0) return [];
  const withStaff = inputs.filter((i) => i.staff_id);
  if (withStaff.length === 0) return [];
  const priced = withStaff.some((i) => i.price > 0);
  const byStaff = new Map<string, { price: number; rate: number; pays: boolean }>();
  for (const i of withStaff) {
    const pays = i.commission_enabled !== false && i.rate > 0;
    const cur = byStaff.get(i.staff_id) ?? { price: 0, rate: 0, pays: false };
    cur.price = addMoney(cur.price, i.price);
    if (pays) {
      cur.rate = Math.max(cur.rate, i.rate);
      cur.pays = true;
    }
    byStaff.set(i.staff_id, cur);
  }
  const totalPrice = priced
    ? [...byStaff.values()].reduce((sum, row) => addMoney(sum, row.price), 0)
    : 0;
  if (priced && totalPrice <= 0) return [];
  const seats = [...byStaff.entries()];
  const parts = (priced ? seats.filter(([, row]) => row.price > 0) : seats).map(([id, row]) => ({
    id,
    weight: priced ? row.price : 1,
  }));
  const out: Array<{ staff_id: string; base_amount: number; rate: number; amount: number }> = [];
  for (const [staffId, v] of byStaff) {
    if (!v.pays) continue;
    const base = pooledShare({ amount: providerEarningsAmount, parts, id: staffId });
    const amount = percentOf(base, v.rate);
    if (amount > 0) out.push({ staff_id: staffId, base_amount: base, rate: v.rate, amount });
  }
  return out;
}

/**
 * Service commission still left on a cancelled visit after the refund.
 * The fee share replaces it, so each person is reversed by what remains.
 */
export function commissionLeftAfterFeeShare(
  lines: readonly {
    staff_id?: string | null;
    kind?: string | null;
    amount?: number | null;
    metadata?: Record<string, unknown> | null;
  }[],
): Array<{ staff_id: string; amount: number }> {
  const byStaff = new Map<string, number>();
  for (const line of lines) {
    const staffId = line.staff_id ?? "";
    if (!staffId) continue;
    const kind = line.kind ?? "";
    if (kind === "reversal") {
      const reversed = String(line.metadata?.reversed_kind ?? "commission");
      if (reversed === "tip") continue;
    } else if (kind !== "commission" && kind !== "product_commission") {
      continue;
    }
    byStaff.set(staffId, addMoney(byStaff.get(staffId) ?? 0, Number(line.amount ?? 0)));
  }
  const out: Array<{ staff_id: string; amount: number }> = [];
  for (const [staffId, net] of byStaff) {
    if (net > 0.009) out.push({ staff_id: staffId, amount: roundCurrency(-net) });
  }
  return out;
}

/** A salary, hourly wage, booth rent, or guarantee is not reduced by commission the pay run did not pay. */
export function feeShareReplacesStoredCommission(payModel: string | null | undefined): boolean {
  if (!payModel) return true;
  return (
    payModel !== "salary" &&
    payModel !== "hourly" &&
    payModel !== "booth_renter" &&
    payModel !== "base_or_commission_higher"
  );
}

export async function reverseCommissionReplacedByFeeShare(
  admin: SupabaseClient,
  params: { bookingId: string; providerId: string; tenantId?: string | null; financeTransactionId: string },
): Promise<void> {
  const { data, error } = await admin
    .from("staff_earnings_lines")
    .select("staff_id, kind, amount, metadata")
    .eq("booking_id", params.bookingId);
  if (error) throw error;
  const reversals = commissionLeftAfterFeeShare(
    (data ?? []) as Array<{
      staff_id?: string | null;
      kind?: string | null;
      amount?: number | null;
      metadata?: Record<string, unknown> | null;
    }>,
  );
  if (reversals.length === 0) return;
  const staffIds = reversals.map((row) => row.staff_id);
  const { data: plans, error: planError } = await admin
    .from("staff_pay_plans")
    .select("staff_id, pay_model, effective_from")
    .eq("provider_id", params.providerId)
    .in("staff_id", staffIds)
    .order("effective_from", { ascending: false });
  if (planError) return;
  const modelByStaff = new Map<string, string>();
  for (const plan of (plans ?? []) as Array<{ staff_id?: string; pay_model?: string }>) {
    const staffId = plan.staff_id ?? "";
    if (staffId && !modelByStaff.has(staffId) && plan.pay_model) {
      modelByStaff.set(staffId, plan.pay_model);
    }
  }
  const owed = reversals.filter((row) => feeShareReplacesStoredCommission(modelByStaff.get(row.staff_id)));
  if (owed.length === 0) return;
  await insertStaffEarningsLinesIgnoreDuplicates(
    admin,
    owed.map((row) => ({
      booking_id: params.bookingId,
      staff_id: row.staff_id,
      provider_id: params.providerId,
      tenant_id: params.tenantId ?? null,
      source_finance_transaction_id: params.financeTransactionId,
      kind: "reversal",
      base_amount: 0,
      rate: 0,
      amount: row.amount,
      rate_source: "staff",
      reason: "Cancellation fee replaces service commission",
      metadata: { reversed_kind: "commission" },
    })),
  );
}

/**
 * Post `cancellation_fee_share` staff_earnings_lines when the provider setting
 * `provider_settings.staff_share_cancellation_fee` is on (default off).
 * Idempotent when the earnings unique key already has this line.
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
    .select("staff_id, price, provider_staff:staff_id(commission_enabled, commission_rate, commission_percentage, service_commission_rate)")
    .eq("booking_id", params.bookingId)
    .not("staff_id", "is", null);
  if (error) throw error;

  const inputs: StaffLineInput[] = (lines ?? []).map((l: any) => {
    const ps = Array.isArray(l.provider_staff) ? l.provider_staff[0] : l.provider_staff;
    return {
      staff_id: l.staff_id as string,
      price: Number(l.price ?? 0),
      commission_enabled: ps?.commission_enabled ?? null,
      rate: resolveStaffRates(ps ?? {}).serviceRate,
    };
  });

  const plan = planCancellationFeeShareLines(inputs, params.providerEarningsAmount);
  if (plan.length === 0) return { enabled: true, linesCreated: 0, totalShared: 0 };

  await reverseCommissionReplacedByFeeShare(admin, {
    bookingId: params.bookingId,
    providerId: params.providerId,
    tenantId: params.tenantId,
    financeTransactionId: params.financeTransactionId,
  });

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

  let linesCreated = 0;
  let totalShared = 0;
  for (const row of rows) {
    const inserted = await insertStaffEarningsLinesIgnoreDuplicates(admin, [row]);
    if (inserted > 0) {
      linesCreated += inserted;
      totalShared = addMoney(totalShared, Number(row.amount ?? 0));
    }
  }

  return {
    enabled: true,
    linesCreated,
    totalShared: roundCurrency(totalShared),
  };
}
