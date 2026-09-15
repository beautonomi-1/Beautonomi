import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allocateBookingWalletAcrossCharges,
  type ChargeAllocationInput,
} from "@/lib/admin/booking-refund-context";
import { isPrimaryChargeRow } from "@/lib/finance/payment-transaction-net";

export type SyncPaymentTransactionRefundOptions = {
  supabase: SupabaseClient;
  bookingId: string;
  /** Total refunded amount after this sync (cumulative on the booking). */
  cumulativeRefundAmount: number;
  reason: string;
  actorUserId?: string | null;
  /** When set, update this row directly. Otherwise sync all charge rows. */
  transactionId?: string | null;
  /** Charge gross amount — used when syncing a single row only. */
  originalChargeAmount?: number;
};

export type SyncPaymentTransactionRefundResult = {
  synced: boolean;
  transactionId: string | null;
  syncedTransactionIds?: string[];
};

function parseAmount(val: unknown): number {
  const n = parseFloat(String(val ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

type ChargeRow = ChargeAllocationInput & {
  metadata?: Record<string, unknown> | null;
  status?: string;
};

async function loadBookingChargeRows(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<ChargeRow[]> {
  const { data } = await supabase
    .from("payment_transactions")
    .select("id, transaction_type, amount, refund_amount, created_at, metadata, status")
    .eq("booking_id", bookingId)
    .in("status", ["success", "partially_refunded", "refunded"])
    .in("transaction_type", ["charge", "additional_charge"])
    .order("created_at", { ascending: true });

  return (data ?? []) as ChargeRow[];
}

function chargeSortKey(row: ChargeRow): number {
  return isPrimaryChargeRow(row) ? 0 : 1;
}

async function syncOneChargeRow(
  supabase: SupabaseClient,
  row: ChargeRow,
  targetRefund: number,
  reason: string,
  actorUserId: string | null,
): Promise<boolean> {
  const chargeAmount = parseAmount(row.amount);
  const prior = parseAmount(row.refund_amount);
  const target = Math.round(Math.min(chargeAmount, Math.max(prior, targetRefund)) * 100) / 100;

  if (target <= prior + 0.001) {
    return false;
  }

  const isFullRefund = chargeAmount <= 0 || target + 0.001 >= chargeAmount;
  const refundReference = `wallet_refund_sync_${row.id}_${Date.now()}`;

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
    .eq("id", row.id)
    .in("status", ["success", "partially_refunded"])
    .select("id");

  if (error || (updated?.length ?? 0) === 0) {
    return false;
  }
  return true;
}

/**
 * Align payment_transactions charge rows with wallet refunds issued outside
 * POST /api/admin/refunds (e.g. cancellation, provider store_credit).
 * Allocates cumulative refund across all charge rows (primary first).
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

  const rows = await loadBookingChargeRows(supabase, bookingId);
  if (rows.length === 0) {
    return { synced: false, transactionId: null };
  }

  if (transactionId) {
    const row = rows.find((r) => r.id === transactionId);
    if (!row) {
      return { synced: false, transactionId };
    }
    const chargeAmount =
      originalChargeAmount ?? parseAmount(row.amount);
    const synced = await syncOneChargeRow(
      supabase,
      row,
      Math.min(chargeAmount, cumulativeRefundAmount),
      reason,
      actorUserId,
    );
    return { synced, transactionId, syncedTransactionIds: synced ? [transactionId] : [] };
  }

  const sorted = [...rows].sort((a, b) => {
    const pk = chargeSortKey(a) - chargeSortKey(b);
    if (pk !== 0) return pk;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });

  const allocations = allocateBookingWalletAcrossCharges(
    sorted,
    cumulativeRefundAmount,
  );

  const syncedIds: string[] = [];
  for (const row of sorted) {
    const allocation = allocations.get(row.id);
    if (!allocation) continue;
    const ok = await syncOneChargeRow(
      supabase,
      row,
      allocation.effectiveRefunded,
      reason,
      actorUserId,
    );
    if (ok) syncedIds.push(row.id);
  }

  return {
    synced: syncedIds.length > 0,
    transactionId: syncedIds[0] ?? null,
    syncedTransactionIds: syncedIds,
  };
}
