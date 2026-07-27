import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the booking_payments row a gateway refund should attach to.
 * Prefer an exact match on payment_provider_id (Paystack ref, Stripe PI id, etc.)
 * before falling back to the most recent completed tender on the booking.
 */
export async function resolveBookingPaymentIdForRefund(
  supabase: SupabaseClient,
  bookingId: string,
  originalReference: string,
): Promise<string | null> {
  const ref = String(originalReference || "").trim();
  if (!ref) {
    return resolveLatestCompletedBookingPaymentId(supabase, bookingId);
  }

  const { data: byProviderId } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("payment_provider_id", ref)
    .in("status", ["completed", "partially_refunded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((byProviderId as { id?: string } | null)?.id) {
    return (byProviderId as { id: string }).id;
  }

  return resolveLatestCompletedBookingPaymentId(supabase, bookingId);
}

async function resolveLatestCompletedBookingPaymentId(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data: bookingPayment } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("booking_id", bookingId)
    .in("status", ["completed", "partially_refunded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (bookingPayment as { id?: string } | null)?.id ?? null;
}
