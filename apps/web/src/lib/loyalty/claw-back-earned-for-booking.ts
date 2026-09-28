import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reverse loyalty points earned for a booking when cancelled or fully refunded.
 * Requires an existing `earned` ledger row (does not trust booking column alone).
 */
export async function clawBackEarnedLoyaltyForBooking(
  admin: SupabaseClient,
  args: {
    bookingId: string;
    customerId: string;
    bookingNumber?: string | null;
    metadataSource?: string;
  },
): Promise<boolean> {
  const source = args.metadataSource ?? "booking_cancel_earn_clawback";
  const { bookingId, customerId } = args;

  const { data: existingClaw } = await admin
    .from("loyalty_points_ledger")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("customer_id", customerId)
    .contains("metadata", { source })
    .maybeSingle();

  if (existingClaw) return false;

  const { data: earnedRow } = await admin
    .from("loyalty_points_ledger")
    .select("id, points_amount")
    .eq("booking_id", bookingId)
    .eq("customer_id", customerId)
    .eq("transaction_type", "earned")
    .limit(1)
    .maybeSingle();

  if (!earnedRow) return false;

  const points = Number((earnedRow as { points_amount?: number }).points_amount ?? 0);
  if (points <= 0) return false;

  const { error: clawErr } = await (admin.rpc as any)("append_loyalty_ledger_entry", {
    p_customer_id: customerId,
    p_transaction_type: "adjusted",
    p_points_amount: -points,
    p_booking_id: bookingId,
    p_description: `Points reversed for booking ${args.bookingNumber || bookingId}`,
    p_metadata: { source },
    p_expires_at: null,
  });

  if (clawErr) {
    console.error("[clawBackEarnedLoyaltyForBooking] failed:", clawErr);
    return false;
  }
  return true;
}
