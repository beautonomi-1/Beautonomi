import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Record a loyalty points redemption in `loyalty_points_ledger` via
 * `append_loyalty_ledger_entry` (atomic balance_after + advisory lock).
 *
 * Idempotency: when `bookingId` is provided, re-runs no-op if a redeemed row
 * already exists for the same (customer_id, booking_id).
 *
 * Caller MUST pass an admin-scoped Supabase client (service_role) so the RPC runs.
 */
export async function recordLoyaltyRedemption(
  adminClient: SupabaseClient,
  args: {
    customerId: string;
    points: number;
    description: string;
    bookingId?: string | null;
    /** Optional metadata to attach to the ledger row. */
    metadata?: Record<string, unknown>;
  },
): Promise<{ recorded: boolean; points: number; reason?: string }> {
  const { customerId, points, description, bookingId, metadata } = args;

  if (!customerId || !points || points <= 0) {
    return { recorded: false, points: 0, reason: "no_points" };
  }

  if (bookingId) {
    const { data: ledgerExisting } = await adminClient
      .from("loyalty_points_ledger")
      .select("id")
      .eq("customer_id", customerId)
      .eq("booking_id", bookingId)
      .eq("transaction_type", "redeemed")
      .limit(1)
      .maybeSingle();
    if (ledgerExisting) {
      return { recorded: false, points: 0, reason: "already_redeemed" };
    }
  }

  const { error: rpcError } = await (adminClient.rpc as any)("append_loyalty_ledger_entry", {
    p_customer_id: customerId,
    p_transaction_type: "redeemed",
    p_points_amount: -points,
    p_booking_id: bookingId ?? null,
    p_description: description,
    p_metadata: metadata ?? {},
    p_expires_at: null,
  });

  if (rpcError) {
    console.error("Loyalty ledger redeem append failed:", rpcError);
    return { recorded: false, points: 0, reason: "rpc_error" };
  }

  return { recorded: true, points };
}
