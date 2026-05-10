import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Refund loyalty points that were redeemed on a booking, when that booking is
 * cancelled or refunded.
 *
 * Idempotent: if a refund marker already exists for this booking on the ledger,
 * no-op (safe under webhook retries).
 *
 * Caller MUST pass an admin-scoped Supabase client (RLS bypass).
 */
export async function refundRedeemedLoyaltyPoints(
  adminClient: SupabaseClient,
  args: {
    bookingId: string;
    customerId: string;
    pointsRedeemed: number;
    reason: string;
  },
): Promise<{ refunded: boolean; points: number; reason?: string }> {
  const { bookingId, customerId, pointsRedeemed, reason } = args;

  if (!pointsRedeemed || pointsRedeemed <= 0) {
    return { refunded: false, points: 0, reason: "no_points" };
  }

  const { data: existing } = await adminClient
    .from("loyalty_points_ledger")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("customer_id", customerId)
    .eq("transaction_type", "adjusted")
    .contains("metadata", { source: "booking_refund" })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { refunded: false, points: 0, reason: "already_refunded" };
  }

  const { error: rpcError } = await (adminClient.rpc as any)("append_loyalty_ledger_entry", {
    p_customer_id: customerId,
    p_transaction_type: "adjusted",
    p_points_amount: pointsRedeemed,
    p_booking_id: bookingId,
    p_description: `Refund of redeemed points (${reason})`,
    p_metadata: { reason, source: "booking_refund" },
    p_expires_at: null,
  });

  if (rpcError) {
    console.error("Loyalty refund append failed:", rpcError);
    return { refunded: false, points: 0, reason: "rpc_error" };
  }

  return { refunded: true, points: pointsRedeemed };
}
