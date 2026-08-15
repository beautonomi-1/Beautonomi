import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncPaymentTransactionRefundOptions = {
  supabase: SupabaseClient;
  bookingId: string;
  /** Total refunded amount after this sync (cumulative on the charge row). */
  cumulativeRefundAmount: number;
  reason: string;
  actorUserId?: string | null;
  /** When set, update this row directly. Otherwise resolve the booking charge. */
  transactionId?: string | null;
  /** Charge gross amount — used to pick refunded vs partially_refunded. */
  originalChargeAmount?: number;
};

export type SyncPaymentTransactionRefundResult = {
  synced: boolean;
  transactionId: string | null;
};

function parseAmount(val: unknown): number {
  const n = parseFloat(String(val ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

async function resolveChargeTransactionId(
  supabase: SupabaseClient,
  bookingId: string,
  transactionId?: string | null,
): Promise<string | null> {
  if (transactionId) return transactionId;

  const { data: chargeTxns } = await supabase
    .from("payment_transactions")
    .select("id, transaction_type, created_at")
    .eq("booking_id", bookingId)
    .in("status", ["success", "partially_refunded"])
    .in("transaction_type", ["charge", "additional_charge"])
    .order("created_at", { ascending: false });

  const rows = (chargeTxns ?? []) as Array<{ id: string; transaction_type?: string | null }>;
  const primary = rows.find((t) => t.transaction_type === "charge") ?? rows[0];
  return primary?.id ?? null;
}

/**
 * Align payment_transactions charge rows with wallet refunds issued outside
 * POST /api/admin/refunds (e.g. cancellation, provider store_credit).
 * Idempotent: skips rows already at or above the target cumulative refund.
 */
export async function syncPaymentTransactionRefundState(
  opts: SyncPaymentTransactionRefundOptions,
): Promise<SyncPaymentTransactionRefundResult> {
  const {
    supabase,
    bookingId,
    cumulativeRefundAmount,
    reason,
    actorUserId = null,
    transactionId,
    originalChargeAmount,
  } = opts;

  const resolvedId = await resolveChargeTransactionId(supabase, bookingId, transactionId);
  if (!resolvedId) {
    return { synced: false, transactionId: null };
  }

  const { data: txn } = await supabase
    .from("payment_transactions")
    .select("id, amount, refund_amount, status")
    .eq("id", resolvedId)
    .maybeSingle();

  if (!txn) {
    return { synced: false, transactionId: resolvedId };
  }

  const prior = parseAmount((txn as { refund_amount?: unknown }).refund_amount);
  const chargeAmount =
    originalChargeAmount ?? parseAmount((txn as { amount?: unknown }).amount);
  const target = Math.round(
    Math.min(chargeAmount, Math.max(prior, cumulativeRefundAmount)) * 100,
  ) / 100;
  if (target <= prior + 0.001) {
    return { synced: false, transactionId: resolvedId };
  }

  const isFullRefund =
    chargeAmount <= 0 || target + 0.001 >= chargeAmount;
  const refundReference = `wallet_refund_sync_${resolvedId}_${Date.now()}`;

  const { data: updated, error } = await supabase
    .from("payment_transactions")
    .update({
      refund_amount: target,
      refund_reason: reason,
      refund_reference: refundReference,
      refunded_at: new Date().toISOString(),
      ...(actorUserId ? { refunded_by: actorUserId } : {}),
      status: isFullRefund ? "refunded" : "partially_refunded",
    })
    .eq("id", resolvedId)
    .in("status", ["success", "partially_refunded"])
    .select("id");

  if (error || (updated?.length ?? 0) === 0) {
    return { synced: false, transactionId: resolvedId };
  }

  return { synced: true, transactionId: resolvedId };
}
