import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Paystack verify/webhook can omit custom metadata. Wallet init stores
 * `paystack_reference` on `wallet_topups` and uses references `wallet_topup_{id}`.
 */
export async function enrichWalletTopupMetadataFromReference(
  supabase: SupabaseClient,
  reference: string | undefined | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (metadata.wallet_topup_id) return;
  const ref = String(reference ?? "").trim();
  if (!ref) return;

  const parsed = /^wallet_topup_([0-9a-f-]{36})$/i.exec(ref);
  if (parsed?.[1]) {
    metadata.wallet_topup_id = parsed[1];
    return;
  }

  const { data: topupByRef } = await supabase
    .from("wallet_topups")
    .select("id")
    .eq("paystack_reference", ref)
    .maybeSingle();
  const id = (topupByRef as { id?: unknown } | null)?.id;
  if (id != null && String(id).trim() !== "") {
    metadata.wallet_topup_id = String(id);
  }
}
