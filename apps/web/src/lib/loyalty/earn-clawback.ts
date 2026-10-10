import type { SupabaseClient } from "@supabase/supabase-js";

/** Canonical metadata.source for reversing booking earn rows (978+). */
export const LOYALTY_EARN_CLAWBACK_SOURCE = "earn_clawback";

/** Legacy metadata.source values (pre-978); kept for documentation only. */
export const LEGACY_LOYALTY_EARN_CLAWBACK_SOURCES = [
  "booking_refund_earn_clawback",
  "booking_cancel_earn_clawback",
  "provider_refund_earn_clawback",
] as const;

/**
 * True when this booking already has a negative `adjusted` earn reversal
 * (matches DB trigger idempotency in migration 978).
 */
export async function hasBookingEarnClawback(
  admin: SupabaseClient,
  bookingId: string,
  customerId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("loyalty_points_ledger")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("customer_id", customerId)
    .eq("transaction_type", "adjusted")
    .lt("points_amount", 0)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}
