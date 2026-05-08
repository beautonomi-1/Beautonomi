import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateLoyaltyPoints } from "./calculate-points";

/**
 * Record loyalty points earned into BOTH balance stores so the customer's
 * visible balance stays consistent.
 * 
 * Writes to BOTH stores:
 *   - `loyalty_points_ledger`  (canonical, read by `get_customer_available_points`)
 *   - `loyalty_point_transactions` (legacy, read by `get_user_loyalty_balance`)
 * 
 * Caller MUST pass an admin-scoped Supabase client (RLS bypass).
 */
export async function recordLoyaltyEarned(
  adminClient: SupabaseClient,
  args: {
    customerId: string;
    baseAmount: number;
    currency: string;
    bookingId: string;
    bookingNumber?: string | null;
  }
): Promise<{ recorded: boolean; points: number }> {
  const { customerId, baseAmount, currency, bookingId, bookingNumber } = args;

  if (!customerId || baseAmount <= 0) {
    return { recorded: false, points: 0 };
  }

  const pointsEarned = await calculateLoyaltyPoints(baseAmount, adminClient, currency);
  if (pointsEarned <= 0) {
    return { recorded: false, points: 0 };
  }

  // Check ledger
  const { data: ledgerExisting } = await adminClient
    .from("loyalty_points_ledger")
    .select("id")
    .eq("customer_id", customerId)
    .eq("booking_id", bookingId)
    .eq("transaction_type", "earned")
    .limit(1)
    .maybeSingle();

  if (!ledgerExisting) {
    const { data: balanceData } = await adminClient.rpc(
      "get_customer_available_points",
      { customer_uuid: customerId },
    );
    const currentBalance = Number(balanceData ?? 0) || 0;

    await adminClient.from("loyalty_points_ledger").insert({
      customer_id: customerId,
      transaction_type: "earned",
      points_amount: pointsEarned,
      balance_after: currentBalance + pointsEarned,
      booking_id: bookingId,
      description: `Points earned for completed booking ${bookingNumber || bookingId}`,
    });
  }

  // Check legacy
  const { data: legacyExisting } = await adminClient
    .from("loyalty_point_transactions")
    .select("id")
    .eq("user_id", customerId)
    .eq("reference_id", bookingId)
    .eq("reference_type", "booking")
    .eq("transaction_type", "earned")
    .limit(1)
    .maybeSingle();

  if (!legacyExisting) {
    await adminClient.from("loyalty_point_transactions").insert({
      user_id: customerId,
      transaction_type: "earned",
      points: pointsEarned,
      description: `Points earned for completed booking ${bookingNumber || bookingId}`,
      reference_id: bookingId,
      reference_type: "booking",
      expires_at: null,
    });
  }

  // Update booking 
  await adminClient.from("bookings").update({ loyalty_points_earned: pointsEarned }).eq("id", bookingId);

  return { recorded: !ledgerExisting || !legacyExisting, points: pointsEarned };
}
