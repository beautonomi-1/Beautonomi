/**
 * Split-payment group bookings record each guest's share as a `booking_payments` row on the
 * primary (lead) booking. Those funds belong to the guest, so cancellations must send them
 * back to the guest's original card rather than to the lead customer's wallet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, subtractMoney } from "@beautonomi/utils";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";

export const GROUP_GUEST_PAYMENT_SOURCE = "group_participant_paystack";

export type GroupGuestSharePayment = {
  paymentId: string;
  participantId: string | null;
  reference: string;
  amount: number;
  /** Amount already refunded or currently being refunded to the original card. */
  refunded: number;
  /** amount − refunded */
  net: number;
};

const PARTICIPANT_NOTE_RE = /Group participant ([0-9a-f-]{36})/i;

export async function listGroupGuestSharePayments(
  admin: SupabaseClient,
  bookingId: string,
  participantId?: string | null,
): Promise<GroupGuestSharePayment[]> {
  const { data: payments, error } = await admin
    .from("booking_payments")
    .select("id, amount, status, notes, payment_provider_id, payment_provider_data")
    .eq("booking_id", bookingId)
    .in("status", ["completed", "partially_refunded"]);
  if (error) throw error;

  const guestRows = ((payments ?? []) as Array<{
    id: string;
    amount: number | string | null;
    notes?: string | null;
    payment_provider_id?: string | null;
    payment_provider_data?: Record<string, unknown> | null;
  }>).filter((p) => p.payment_provider_data?.source === GROUP_GUEST_PAYMENT_SOURCE);
  if (guestRows.length === 0) return [];

  const { data: refunds, error: refundErr } = await admin
    .from("booking_refunds")
    .select("payment_id, amount, status")
    .in(
      "payment_id",
      guestRows.map((p) => p.id),
    )
    .eq("refund_method", "original")
    .in("status", ["pending", "completed"]);
  if (refundErr) throw refundErr;

  const refundedByPayment = new Map<string, number>();
  for (const r of (refunds ?? []) as Array<{ payment_id: string; amount: number | string }>) {
    refundedByPayment.set(
      r.payment_id,
      addMoney(refundedByPayment.get(r.payment_id) ?? 0, Number(r.amount ?? 0)),
    );
  }

  return guestRows
    .map((p) => {
      const data = p.payment_provider_data ?? {};
      const tagged =
        typeof data.group_participant_id === "string" ? data.group_participant_id : null;
      const fromNotes = PARTICIPANT_NOTE_RE.exec(p.notes ?? "")?.[1] ?? null;
      const amount = roundCurrency2(Math.max(0, Number(p.amount ?? 0)));
      const refunded = refundedByPayment.get(p.id) ?? 0;
      return {
        paymentId: p.id,
        participantId: tagged ?? fromNotes,
        reference: String(p.payment_provider_id ?? ""),
        amount,
        refunded,
        net: Math.max(0, subtractMoney(amount, refunded)),
      };
    })
    .filter((p) => !participantId || p.participantId === participantId);
}

export type GuestShareRefundOutcome = {
  /** Guest-paid funds that were still held before this call (refunded now or pending retry). */
  guestPaidNet: number;
  refunded: number;
  failed: number;
};

/**
 * Refund guest share payments on `bookingId` to the guests' original cards. Each refund is
 * written to `booking_refunds` (`refund_method = 'original'`) before the gateway call, so a
 * retry reuses the failed row instead of refunding twice.
 */
export async function refundGroupGuestSharePayments(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    currency: string;
    tenantId?: string | null;
    reason: string;
    participantId?: string | null;
    /** Cap the total refunded across the matched payments (defaults to everything held). */
    maxAmount?: number;
  },
): Promise<GuestShareRefundOutcome> {
  const payments = await listGroupGuestSharePayments(admin, input.bookingId, input.participantId);
  const guestPaidNet = payments.reduce((s, p) => addMoney(s, p.net), 0);
  let budget =
    typeof input.maxAmount === "number" && Number.isFinite(input.maxAmount)
      ? roundCurrency2(Math.max(0, input.maxAmount))
      : guestPaidNet;

  let refunded = 0;
  let failed = 0;
  for (const payment of payments) {
    const amount = roundCurrency2(Math.min(payment.net, budget));
    if (amount <= 0.009 || !payment.reference) continue;
    budget = subtractMoney(budget, amount);
    const ok = await refundOneGuestPayment(admin, {
      bookingId: input.bookingId,
      payment,
      amount,
      currency: input.currency,
      tenantId: input.tenantId ?? null,
      reason: input.reason,
    });
    if (ok) refunded = addMoney(refunded, amount);
    else failed = addMoney(failed, amount);
  }

  return { guestPaidNet, refunded, failed };
}

async function refundOneGuestPayment(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    payment: GroupGuestSharePayment;
    amount: number;
    currency: string;
    tenantId: string | null;
    reason: string;
  },
): Promise<boolean> {
  const { data: failedRow } = await admin
    .from("booking_refunds")
    .select("id")
    .eq("payment_id", input.payment.paymentId)
    .eq("refund_method", "original")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let refundRowId: string | null = (failedRow as { id?: string } | null)?.id ?? null;
  if (refundRowId) {
    const { error } = await admin
      .from("booking_refunds")
      .update({ status: "pending", amount: input.amount, reason: input.reason })
      .eq("id", refundRowId)
      .eq("status", "failed");
    if (error) refundRowId = null;
  }
  if (!refundRowId) {
    const { data: inserted, error } = await admin
      .from("booking_refunds")
      .insert({
        booking_id: input.bookingId,
        payment_id: input.payment.paymentId,
        amount: input.amount,
        reason: input.reason,
        refund_method: "original",
        status: "pending",
        notes: input.payment.participantId
          ? `Group guest share refund to original payment (participant ${input.payment.participantId})`
          : "Group guest share refund to original payment",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("[group-guest-refunds] refund row insert failed:", error);
      return false;
    }
    refundRowId = String((inserted as { id: string }).id);
  }

  try {
    const { refundGatewayCharge } = await import("@/lib/payments/refund-gateway-charge");
    const result = await refundGatewayCharge({
      reference: input.payment.reference,
      amountMajor: input.amount,
      currency: input.currency,
      tenantId: input.tenantId,
      reason: input.reason,
      idempotencyKey: `group-guest-refund:${refundRowId}`,
    });
    await admin
      .from("booking_refunds")
      .update({ status: "completed", refund_provider_id: result.refundId })
      .eq("id", refundRowId);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[group-guest-refunds] gateway refund failed:", message, {
      bookingId: input.bookingId,
      paymentId: input.payment.paymentId,
    });
    await admin
      .from("booking_refunds")
      .update({ status: "failed", notes: `Gateway refund failed: ${message.slice(0, 400)}` })
      .eq("id", refundRowId);
    return false;
  }
}
