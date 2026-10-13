import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Card-machine refunds staff must perform on the machine (Yoco has no refund API).
 *
 * Stored as `booking_refunds` rows with status `pending` and
 * `machine_refund_provider = 'yoco'` (migration 997). Pending rows count toward
 * the in-person refund cap (`fetchCompletedInPersonRefundsTotal`), so the same
 * money cannot be refunded twice, but they do not touch the ledger or the
 * booking payment status until completed.
 */

export type MachineRefundProvider = "yoco";

export type AwaitingMachineRefund = {
  id: string;
  booking_id: string;
  payment_id: string | null;
  amount: number;
  reason: string | null;
  machine_refund_provider: MachineRefundProvider;
  awaiting_machine_since: string | null;
  created_at: string | null;
};

const AWAITING_SELECT =
  "id, booking_id, payment_id, amount, reason, machine_refund_provider, awaiting_machine_since, created_at";

function roundCurrency2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapRow(row: Record<string, unknown>): AwaitingMachineRefund {
  return {
    id: String(row.id),
    booking_id: String(row.booking_id),
    payment_id: (row.payment_id as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    reason: (row.reason as string | null) ?? null,
    machine_refund_provider: "yoco",
    awaiting_machine_since: (row.awaiting_machine_since as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

/** Largest completed Yoco capture on the booking (the row the machine refund reverses). */
export function pickYocoRefundPaymentId(
  bookingPayments: Array<{
    id?: string | null;
    payment_provider?: string | null;
    status?: string | null;
    amount?: number | string | null;
    payment_provider_id?: string | null;
  }>,
): string | null {
  const rows = bookingPayments.filter((p) => {
    const provider = String(p.payment_provider ?? "").toLowerCase();
    const ref = String(p.payment_provider_id ?? "");
    return (
      provider === "yoco" &&
      (p.status === "completed" || p.status === "partially_refunded") &&
      !ref.endsWith(":tip") &&
      !ref.endsWith(":cashback")
    );
  });
  rows.sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0));
  return rows[0]?.id ? String(rows[0].id) : null;
}

export async function fetchAwaitingMachineRefunds(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<AwaitingMachineRefund[]> {
  const { data, error } = await supabase
    .from("booking_refunds")
    .select(AWAITING_SELECT)
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .not("machine_refund_provider", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[awaiting-machine-refunds] fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/**
 * Record that the customer is owed a refund on the Yoco machine. Idempotent per
 * booking: an existing open obligation is returned instead of adding another.
 */
export async function createAwaitingYocoRefund(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    amount: number;
    paymentId: string | null;
    reason: string;
    createdBy: string | null;
  },
): Promise<AwaitingMachineRefund | null> {
  const amount = roundCurrency2(input.amount);
  if (!(amount > 0.01)) return null;

  const existing = await fetchAwaitingMachineRefunds(supabase, input.bookingId);
  if (existing.length) return existing[0];

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("booking_refunds")
    .insert({
      booking_id: input.bookingId,
      payment_id: input.paymentId,
      amount,
      reason: input.reason,
      refund_method: "original",
      status: "pending",
      machine_refund_provider: "yoco",
      awaiting_machine_since: now,
      notes: "Awaiting refund on the Yoco card machine — record it once completed on the machine",
      created_by: input.createdBy,
    })
    .select(AWAITING_SELECT)
    .single();
  if (error || !data) {
    console.error("[awaiting-machine-refunds] create failed:", error?.message);
    return null;
  }
  return mapRow(data as Record<string, unknown>);
}

/**
 * Staff completed (part of) an awaiting machine refund. Completes the existing
 * pending row so the cap is not consumed twice. A partial record keeps the
 * remainder outstanding as a new awaiting row.
 */
export async function completeAwaitingMachineRefund(
  supabase: SupabaseClient,
  row: AwaitingMachineRefund,
  input: { amount: number; reason: string; notes?: string | null; recordedBy: string | null },
): Promise<{ ok: true; refundId: string; remaining: number } | { ok: false; message: string }> {
  const amount = roundCurrency2(input.amount);
  if (!(amount > 0) || amount > row.amount + 0.01) {
    return { ok: false, message: "Amount exceeds the outstanding machine refund." };
  }
  const remaining = roundCurrency2(Math.max(0, row.amount - amount));

  const { error } = await supabase
    .from("booking_refunds")
    .update({
      amount,
      reason: input.reason,
      status: "completed",
      notes: input.notes || "Provider refund – recorded after Yoco card machine refund",
      created_by: input.recordedBy ?? undefined,
    })
    .eq("id", row.id)
    .eq("status", "pending");
  if (error) return { ok: false, message: error.message };

  if (remaining > 0.01) {
    await supabase.from("booking_refunds").insert({
      booking_id: row.booking_id,
      payment_id: row.payment_id,
      amount: remaining,
      reason: row.reason ?? input.reason,
      refund_method: "original",
      status: "pending",
      machine_refund_provider: row.machine_refund_provider,
      awaiting_machine_since: row.awaiting_machine_since ?? new Date().toISOString(),
      notes: "Remaining refund still owed on the Yoco card machine",
      created_by: input.recordedBy,
    });
  }

  return { ok: true, refundId: row.id, remaining };
}

export function sumAwaitingMachineRefunds(rows: AwaitingMachineRefund[]): number {
  return roundCurrency2(rows.reduce((s, r) => s + r.amount, 0));
}

/**
 * The customer was refunded through another channel (cash / wallet) instead of
 * the machine. Shrinks or closes open obligations by `amount` so the same money
 * is not owed twice. Returns the amount released.
 */
export async function releaseAwaitingMachineRefunds(
  supabase: SupabaseClient,
  bookingId: string,
  amount: number,
  note: string,
): Promise<number> {
  let left = roundCurrency2(amount);
  if (!(left > 0)) return 0;
  const rows = await fetchAwaitingMachineRefunds(supabase, bookingId);
  let released = 0;
  for (const row of rows) {
    if (left <= 0.01) break;
    if (left + 0.01 >= row.amount) {
      await supabase
        .from("booking_refunds")
        .update({ status: "cancelled", notes: note })
        .eq("id", row.id)
        .eq("status", "pending");
      left = roundCurrency2(left - row.amount);
      released = roundCurrency2(released + row.amount);
    } else {
      await supabase
        .from("booking_refunds")
        .update({ amount: roundCurrency2(row.amount - left) })
        .eq("id", row.id)
        .eq("status", "pending");
      released = roundCurrency2(released + left);
      left = 0;
    }
  }
  return released;
}

/**
 * A Yoco refund webhook arrived for this booking.
 *
 * - Partial refunds: link the webhook to an open obligation (complete it in place)
 *   or to a staff-recorded refund without a provider reference, so the same
 *   money is not booked twice. Returns true when the refund is already
 *   represented and the caller must not insert another row.
 * - Full reversals: if staff already recorded the whole amount by hand, link
 *   those rows and skip the reversal. Otherwise the reversal writes its own
 *   completed rows and any open obligation is closed as `cancelled`.
 */
export async function reconcileYocoRefundWebhook(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    amount: number;
    yocoRefundId: string;
    paymentId: string | null;
    mode: "partial" | "full";
  },
): Promise<boolean> {
  const awaiting = await fetchAwaitingMachineRefunds(supabase, input.bookingId);
  const amount = roundCurrency2(input.amount);

  const { data: manualRows } = await supabase
    .from("booking_refunds")
    .select("id, amount")
    .eq("booking_id", input.bookingId)
    .eq("status", "completed")
    .eq("refund_method", "original")
    .eq("machine_refund_provider", "yoco")
    .is("refund_provider_id", null)
    .order("created_at", { ascending: true });
  const manual = (manualRows ?? []) as Array<{ id: string; amount: number | string }>;

  if (input.mode === "full") {
    const manualTotal = roundCurrency2(manual.reduce((s, r) => s + Number(r.amount ?? 0), 0));
    if (manual.length && manualTotal + 0.01 >= amount) {
      await supabase
        .from("booking_refunds")
        .update({ refund_provider_id: input.yocoRefundId })
        .in(
          "id",
          manual.map((r) => r.id),
        );
      for (const row of awaiting) {
        await supabase
          .from("booking_refunds")
          .update({
            status: "cancelled",
            notes: `Closed — Yoco refund ${input.yocoRefundId} already recorded`,
          })
          .eq("id", row.id)
          .eq("status", "pending");
      }
      return true;
    }
    for (const row of awaiting) {
      await supabase
        .from("booking_refunds")
        .update({
          status: "cancelled",
          notes: `Closed — Yoco refund ${input.yocoRefundId} reversed the payment`,
        })
        .eq("id", row.id)
        .eq("status", "pending");
    }
    return false;
  }

  const match = awaiting.find((r) => Math.abs(r.amount - amount) <= 0.01) ?? awaiting[0];
  if (match && amount <= match.amount + 0.01) {
    const remaining = roundCurrency2(Math.max(0, match.amount - amount));
    await supabase
      .from("booking_refunds")
      .update({
        amount,
        status: "completed",
        refund_provider_id: input.yocoRefundId,
        payment_id: match.payment_id ?? input.paymentId,
        notes: `Yoco refund ${input.yocoRefundId} confirmed by Yoco`,
      })
      .eq("id", match.id)
      .eq("status", "pending");
    if (remaining > 0.01) {
      await supabase.from("booking_refunds").insert({
        booking_id: match.booking_id,
        payment_id: match.payment_id,
        amount: remaining,
        reason: match.reason,
        refund_method: "original",
        status: "pending",
        machine_refund_provider: "yoco",
        awaiting_machine_since: match.awaiting_machine_since ?? new Date().toISOString(),
        notes: "Remaining refund still owed on the Yoco card machine",
      });
    }
    return true;
  }

  const manualMatch = manual.find((r) => Math.abs(Number(r.amount ?? 0) - amount) <= 0.01);
  if (manualMatch) {
    await supabase
      .from("booking_refunds")
      .update({ refund_provider_id: input.yocoRefundId })
      .eq("id", manualMatch.id);
    return true;
  }

  return false;
}
