import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Applies a tip charged with a booking_payments row exactly once (migration 9991).
 * Returns the booking's tip excluding every per-payment tip, i.e. the checkout-level
 * tip the ledger treats as the booking tip. Throws on failure so the webhook is retried.
 */
export async function applyBookingPaymentTip(
  supabase: SupabaseClient,
  bookingId: string,
  bookingPaymentId: string,
  tip: number,
): Promise<{ bookingLevelTip: number }> {
  const { error } = await supabase.rpc("apply_booking_payment_tip", {
    p_booking_payment_id: bookingPaymentId,
    p_tip_amount: Math.round(Math.max(0, tip) * 100) / 100,
  });
  if (error) {
    throw new Error(`apply_booking_payment_tip failed for booking ${bookingId}: ${error.message}`);
  }

  const { data: booking, error: readError } = await supabase
    .from("bookings")
    .select("tip_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (readError || !booking) {
    throw new Error(
      `Failed to read booking ${bookingId} after applying tip: ${readError?.message ?? "not found"}`,
    );
  }

  const { data: applications, error: applicationsError } = await supabase
    .from("booking_tip_applications")
    .select("tip_amount")
    .eq("booking_id", bookingId);
  if (applicationsError) {
    throw new Error(
      `Failed to read tip applications for booking ${bookingId}: ${applicationsError.message}`,
    );
  }
  const perPaymentTips = ((applications ?? []) as Array<{ tip_amount?: number | null }>).reduce(
    (sum, row) => sum + Number(row.tip_amount ?? 0),
    0,
  );
  const bookingTip = Number((booking as { tip_amount?: number | null }).tip_amount ?? 0);
  return { bookingLevelTip: Math.max(0, Math.round((bookingTip - perPaymentTips) * 100) / 100) };
}

/** Adds tip to a booking's tip_amount and total_amount (idempotent callers must guard). */
export async function incrementBookingTipAmount(
  supabase: SupabaseClient,
  bookingId: string,
  tip: number,
): Promise<void> {
  const rounded = Math.round(Math.max(0, tip) * 100) / 100;
  if (rounded <= 0) return;

  const { data: booking } = await supabase
    .from("bookings")
    .select("tip_amount, total_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;

  await supabase
    .from("bookings")
    .update({
      tip_amount: Number(booking.tip_amount ?? 0) + rounded,
      total_amount: Number(booking.total_amount ?? 0) + rounded,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);
}
