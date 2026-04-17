import type { SupabaseClient } from "@supabase/supabase-js";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";

export type NegativeBalanceProviderRow = {
  provider_id: string;
  raw_balance: number;
  business_name: string | null;
  slug: string | null;
};

export type NegativeBalanceProvidersPayload = {
  count: number;
  providers: NegativeBalanceProviderRow[];
};

/**
 * Providers whose ledger raw payout balance is negative (e.g. refunds after a payout was sent).
 * Uses the same `getAvailablePayoutBalance` logic as provider/admin payout flows (holdDays 0 = full ledger).
 */
export async function getNegativeBalanceProvidersForTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<NegativeBalanceProvidersPayload> {
  const { data: rows, error } = await supabase
    .from("providers")
    .select("id, business_name, slug")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  const list = rows || [];
  if (list.length === 0) return { count: 0, providers: [] };

  const negative: NegativeBalanceProviderRow[] = [];
  const chunkSize = 30;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const settled = await Promise.all(
      chunk.map(async (p) => {
        const b = await getAvailablePayoutBalance(supabase, p.id, { tenantId, holdDays: 0 });
        return { p, b };
      })
    );
    for (const { p, b } of settled) {
      if (b.hasNegativeBalance) {
        negative.push({
          provider_id: p.id,
          raw_balance: b.rawBalance,
          business_name: p.business_name ?? null,
          slug: p.slug ?? null,
        });
      }
    }
  }

  negative.sort((a, b) => a.raw_balance - b.raw_balance);
  return { count: negative.length, providers: negative };
}
