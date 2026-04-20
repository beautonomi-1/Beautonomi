import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Record a loyalty points redemption into BOTH balance stores so the customer's
 * visible balance stays consistent regardless of which reader the UI/API path
 * consults.
 *
 * §Customer-audit 2026-04: historically the codebase only wrote to the legacy
 * `loyalty_point_transactions` table on redemption, but `/api/me/loyalty-points`,
 * `/api/me/loyalty/balance`, and `validate-booking` all consult
 * `loyalty_points_ledger` first (via `get_customer_available_points`). That
 * meant:
 *   - after a self-service wallet redeem the UI still showed the un-reduced
 *     balance, so the same points could be "redeemed" repeatedly for wallet
 *     credit;
 *   - after a booking-checkout redeem the next booking validator still saw
 *     the un-deducted ledger balance.
 *
 * This helper centralises the write so all entry points (self-service
 * wallet redeem, checkout redeem, webhook idempotency) behave identically.
 *
 * Writes to BOTH stores:
 *   - `loyalty_points_ledger`  (canonical, read by `get_customer_available_points`)
 *   - `loyalty_point_transactions` (legacy, read by `get_user_loyalty_balance`)
 *
 * Idempotency: when `bookingId` is provided, re-runs no-op if a ledger or
 * legacy redeemed row already exists for the same (customer_id, booking_id).
 * Caller MUST pass an admin-scoped Supabase client (RLS bypass).
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
    /** Optional reference for the legacy table. Defaults to bookingId + "booking". */
    legacyReference?: { id: string; type: string };
  },
): Promise<{ recorded: boolean; points: number; reason?: string }> {
  const { customerId, points, description, bookingId, metadata, legacyReference } = args;

  if (!customerId || !points || points <= 0) {
    return { recorded: false, points: 0, reason: "no_points" };
  }

  if (bookingId) {
    const [{ data: ledgerExisting }, { data: legacyExisting }] = await Promise.all([
      adminClient
        .from("loyalty_points_ledger")
        .select("id")
        .eq("customer_id", customerId)
        .eq("booking_id", bookingId)
        .eq("transaction_type", "redeemed")
        .limit(1),
      adminClient
        .from("loyalty_point_transactions")
        .select("id")
        .eq("user_id", customerId)
        .eq("reference_id", bookingId)
        .eq("reference_type", "booking")
        .eq("transaction_type", "redeemed")
        .limit(1),
    ]);
    if (
      (ledgerExisting && ledgerExisting.length > 0) ||
      (legacyExisting && legacyExisting.length > 0)
    ) {
      return { recorded: false, points: 0, reason: "already_redeemed" };
    }
  }

  const { data: balanceData } = await adminClient.rpc(
    "get_customer_available_points",
    { customer_uuid: customerId },
  );
  const currentBalance = Number(balanceData ?? 0) || 0;
  const newBalance = Math.max(0, currentBalance - points);

  const { error: ledgerError } = await adminClient
    .from("loyalty_points_ledger")
    .insert({
      customer_id: customerId,
      transaction_type: "redeemed",
      points_amount: -points,
      balance_after: newBalance,
      booking_id: bookingId ?? null,
      description,
      metadata: metadata ?? {},
    });
  if (ledgerError) {
    console.error("Loyalty ledger redeem insert failed:", ledgerError);
  }

  const legacyRef = legacyReference
    ?? (bookingId ? { id: bookingId, type: "booking" } : null);
  const { error: legacyError } = await adminClient
    .from("loyalty_point_transactions")
    .insert({
      user_id: customerId,
      points,
      transaction_type: "redeemed",
      description,
      ...(legacyRef ? { reference_id: legacyRef.id, reference_type: legacyRef.type } : {}),
    });
  if (legacyError) {
    console.error("Loyalty legacy redeem insert failed:", legacyError);
  }

  return { recorded: true, points };
}
