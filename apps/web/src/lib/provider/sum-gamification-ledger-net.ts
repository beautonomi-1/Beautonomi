import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

/** Ledger lines that contribute to gamification “net earnings” (matches GET /api/provider/gamification). */
export const PROVIDER_GAMIFICATION_LEDGER_TYPES = [
  "provider_earnings",
  "refund",
  "cancellation_fee",
] as const;

function rowNet(row: { net: unknown; amount: unknown }): number {
  return Number(row.net ?? row.amount ?? 0) || 0;
}

/** Sum `net` (fallback `amount`) for gamification-related finance rows — paginated so large ledgers are not capped. */
export async function sumProviderGamificationLedgerNet(
  db: SupabaseClient,
  providerId: string
): Promise<number> {
  let sum = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("finance_transactions")
      .select("net, amount")
      .eq("provider_id", providerId)
      .in("transaction_type", [...PROVIDER_GAMIFICATION_LEDGER_TYPES])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      sum += rowNet(row);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return Math.max(0, sum);
}
