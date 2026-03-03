import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Insert a finance_transactions row of type 'payout' when a payout is completed.
 * This keeps the ledger in sync so getAvailablePayoutBalance correctly subtracts paid-out amounts.
 * Idempotent: if a row with this payout_id already exists, we skip (unique on payout_id).
 */
export async function recordPayoutLedger(
  supabase: SupabaseClient,
  payout: { id: string; provider_id: string; net_amount: number; amount: number; payout_number?: string }
): Promise<void> {
  const amount = Number(payout.net_amount ?? payout.amount ?? 0);
  if (amount <= 0) return;

  const { error } = await (supabase.from("finance_transactions") as any)
    .insert({
      provider_id: payout.provider_id,
      payout_id: payout.id,
      transaction_type: "payout",
      amount,
      fees: 0,
      commission: 0,
      net: amount,
      description: `Payout ${payout.payout_number || payout.id}`,
      created_at: new Date().toISOString(),
    });

  if (error) {
    if (error.code === "23505" || error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return;
    }
    throw error;
  }
}
