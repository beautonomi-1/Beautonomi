import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHARGE_ROW_STATUSES,
  netPaymentTransactionAmount,
} from "@/lib/finance/payment-transaction-net";

function roundCurrency2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Cash-like amount collected for a booking across gateway rows, net of refunds
 * recorded on payment_transactions. Uses booking_refunds only when no gateway
 * rows exist (in-person / cash-only bookings).
 */
export async function getCollectedTotalForBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data: txs, error: txErr } = await supabase
    .from("payment_transactions")
    .select("amount, refund_amount, transaction_type, status")
    .eq("booking_id", bookingId)
    .in("status", [...CHARGE_ROW_STATUSES]);

  if (txErr) throw txErr;

  const inflowTypes = new Set(["charge", "additional_charge"]);
  const netFromTx = (txs ?? []).reduce((sum, row) => {
    const tt = String((row as { transaction_type?: string }).transaction_type || "charge");
    if (!inflowTypes.has(tt)) return sum;
    return sum + netPaymentTransactionAmount(row as { amount?: unknown; refund_amount?: unknown });
  }, 0);

  if (netFromTx > 0) {
    return roundCurrency2(netFromTx);
  }

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("total_paid, total_refunded, wallet_amount, gift_card_amount")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr) throw bookingErr;
  if (!booking) return 0;

  const totalPaid = Number((booking as { total_paid?: number }).total_paid ?? 0);
  const walletGift =
    Number((booking as { wallet_amount?: number }).wallet_amount ?? 0) +
    Number((booking as { gift_card_amount?: number }).gift_card_amount ?? 0);
  const totalRefunded = Number((booking as { total_refunded?: number }).total_refunded ?? 0);
  const collected = Math.max(totalPaid, walletGift);

  return roundCurrency2(Math.max(0, collected - totalRefunded));
}
