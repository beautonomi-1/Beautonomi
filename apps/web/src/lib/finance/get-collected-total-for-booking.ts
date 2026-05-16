import type { SupabaseClient } from "@supabase/supabase-js";

function roundCurrency2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Cash-like amount collected for a booking across gateway rows, minus completed wallet/store-credit refunds.
 * Used to cap dispute "full refund" and admin partial refunds so rewritten `bookings.total_amount` cannot
 * under-state what was actually charged.
 */
export async function getCollectedTotalForBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data: txs, error: txErr } = await supabase
    .from("payment_transactions")
    .select("amount, transaction_type")
    .eq("booking_id", bookingId)
    .eq("status", "success");

  if (txErr) throw txErr;

  const inflowTypes = new Set(["charge", "additional_charge"]);
  const collected = (txs ?? []).reduce((sum, row) => {
    const tt = String((row as { transaction_type?: string }).transaction_type || "charge");
    if (!inflowTypes.has(tt)) return sum;
    return sum + Number((row as { amount?: unknown }).amount ?? 0);
  }, 0);

  const { data: refunds, error: refErr } = await supabase
    .from("booking_refunds")
    .select("amount")
    .eq("booking_id", bookingId)
    .eq("status", "completed");

  if (refErr) throw refErr;

  const refunded = (refunds ?? []).reduce(
    (sum, row) => sum + Number((row as { amount?: unknown }).amount ?? 0),
    0,
  );

  return roundCurrency2(Math.max(0, collected - refunded));
}
