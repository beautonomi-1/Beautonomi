import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Refund loyalty points that were redeemed on a booking, when that booking is
 * cancelled or refunded.
 *
 * §Release-audit 2026-04: previously, redeemed loyalty points were never
 * returned to the customer when a booking was cancelled or refunded — the
 * points were silently lost. This helper centralises the refund so cancel
 * routes, refund handlers, and admin tooling all behave the same way.
 *
 * Writes to BOTH stores so balance reads stay consistent regardless of
 * source:
 *   - `loyalty_points_ledger`  (canonical, used by `get_customer_available_points`)
 *   - `loyalty_point_transactions` (legacy, used by `get_user_loyalty_balance`)
 *
 * Idempotent: if a refund row already exists for this `booking_id` we no-op,
 * to make webhook + manual cancel safe under retries.
 *
 * Caller MUST pass an admin-scoped Supabase client (RLS bypass) so this
 * works from cron / webhook contexts and from customer self-service routes.
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

  // Idempotency: check whether we have already refunded for this booking on
  // either ledger. We treat any positive non-`earned` row pointing at the
  // booking as the refund marker.
  const [{ data: ledgerExisting }, { data: legacyExisting }] = await Promise.all([
    adminClient
      .from("loyalty_points_ledger")
      .select("id, transaction_type, points_amount, metadata")
      .eq("booking_id", bookingId)
      .eq("customer_id", customerId)
      .in("transaction_type", ["adjusted", "bonus"])
      .gt("points_amount", 0)
      .limit(1),
    adminClient
      .from("loyalty_point_transactions")
      .select("id, transaction_type, points")
      .eq("source_id", bookingId)
      .eq("user_id", customerId)
      .in("transaction_type", ["adjusted", "earned"])
      .gt("points", 0)
      .limit(1),
  ]);

  if ((ledgerExisting && ledgerExisting.length > 0) || (legacyExisting && legacyExisting.length > 0)) {
    return { refunded: false, points: 0, reason: "already_refunded" };
  }

  // Compute new balance for the ledger (`balance_after` is NOT NULL).
  const { data: balanceData } = await adminClient.rpc(
    "get_customer_available_points",
    { p_customer_id: customerId },
  );
  const currentBalance = Number(balanceData ?? 0) || 0;
  const newBalance = currentBalance + pointsRedeemed;

  // 1) Canonical ledger row.
  await adminClient.from("loyalty_points_ledger").insert({
    customer_id: customerId,
    transaction_type: "adjusted",
    points_amount: pointsRedeemed,
    balance_after: newBalance,
    booking_id: bookingId,
    description: `Refund of redeemed points (${reason})`,
    metadata: { reason, source: "booking_refund" },
  });

  // 2) Legacy transactions table (still consulted by older endpoints).
  await adminClient.from("loyalty_point_transactions").insert({
    user_id: customerId,
    points: pointsRedeemed,
    transaction_type: "adjusted",
    source: "booking_refund",
    source_id: bookingId,
    description: `Refund of ${pointsRedeemed} loyalty points (${reason})`,
  });

  return { refunded: true, points: pointsRedeemed };
}
