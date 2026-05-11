import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateLoyaltyPoints } from "./calculate-points";

/**
 * Ensure loyalty points earned for a completed booking exist on the canonical
 * ledger. Usually the DB trigger `award_loyalty_points_on_booking_completion`
 * already inserted the row; this helper is idempotent backup for timing/race
 * edge cases.
 *
 * Caller MUST pass an admin-scoped Supabase client (service_role).
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

  const { data: ledgerExisting } = await adminClient
    .from("loyalty_points_ledger")
    .select("id")
    .eq("customer_id", customerId)
    .eq("booking_id", bookingId)
    .eq("transaction_type", "earned")
    .limit(1)
    .maybeSingle();

  if (ledgerExisting) {
    return { recorded: false, points: pointsEarned };
  }

  const desc = `Points earned for completed booking ${bookingNumber || bookingId}`;
  const { error: rpcError } = await (adminClient.rpc as any)("append_loyalty_ledger_entry", {
    p_customer_id: customerId,
    p_transaction_type: "earned",
    p_points_amount: pointsEarned,
    p_booking_id: bookingId,
    p_description: desc,
    p_metadata: {},
    p_expires_at: null,
  });

  if (rpcError) {
    const code = (rpcError as { code?: string }).code;
    if (code === "23505") {
      return { recorded: false, points: pointsEarned };
    }
    console.error("Loyalty ledger earn append failed:", rpcError);
    return { recorded: false, points: pointsEarned };
  }

  await adminClient.from("bookings").update({ loyalty_points_earned: pointsEarned }).eq("id", bookingId);

  return { recorded: true, points: pointsEarned };
}
