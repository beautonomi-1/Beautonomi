/**
 * Re-apply entitlement from stored Apple JWS when the device did not return
 * purchases (StoreKit) but we already logged a subscription transaction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { processAppleSignedTransaction } from "@/lib/iap/apple/entitlement-bridge";

type AppleTxRow = {
  raw_jws: string | null;
  expires_date: string | null;
  grace_period_expires_date: string | null;
  revocation_date: string | null;
  product_id: string;
};

function isEntitledSubscriptionRow(row: AppleTxRow, now: Date): boolean {
  if (row.revocation_date) return false;
  const endRaw = row.grace_period_expires_date ?? row.expires_date;
  if (!endRaw) return false;
  const end = new Date(endRaw);
  return Number.isFinite(end.getTime()) && end > now;
}

/** True when apple_iap_transactions shows a non-revoked subscription still in period. */
export async function providerHasEntitledAppleSubscriptionInLog(
  supabase: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("apple_iap_transactions")
    .select("expires_date, grace_period_expires_date, revocation_date")
    .eq("provider_id", providerId)
    .eq("transaction_type", "Auto-Renewable Subscription")
    .is("revocation_date", null)
    .order("expires_date", { ascending: false })
    .limit(15);

  if (error) {
    console.warn("[apple resync] entitled check failed:", error);
    return false;
  }

  const now = new Date();
  return (data ?? []).some((row) => isEntitledSubscriptionRow(row as AppleTxRow, now));
}

export async function resyncProviderSubscriptionFromAppleLog(
  supabase: SupabaseClient,
  providerId: string,
): Promise<{ ok: boolean; applied: boolean; error?: string; productId?: string }> {
  const { data, error } = await supabase
    .from("apple_iap_transactions")
    .select(
      "raw_jws, expires_date, grace_period_expires_date, revocation_date, product_id, purchase_date",
    )
    .eq("provider_id", providerId)
    .eq("transaction_type", "Auto-Renewable Subscription")
    .not("raw_jws", "is", null)
    .is("revocation_date", null)
    .order("expires_date", { ascending: false })
    .limit(25);

  if (error) {
    return { ok: false, applied: false, error: error.message };
  }

  const now = new Date();
  const entitled = ((data ?? []) as AppleTxRow[]).filter((row) =>
    isEntitledSubscriptionRow(row, now),
  );
  if (entitled.length === 0) {
    return {
      ok: false,
      applied: false,
      error: "No active Apple subscription record found for this business.",
    };
  }

  entitled.sort((a, b) => {
    const ae = new Date(a.grace_period_expires_date ?? a.expires_date ?? 0).getTime();
    const be = new Date(b.grace_period_expires_date ?? b.expires_date ?? 0).getTime();
    return be - ae;
  });

  const jws = entitled[0].raw_jws?.trim();
  if (!jws) {
    return { ok: false, applied: false, error: "Missing signed transaction data." };
  }

  const result = await processAppleSignedTransaction({
    supabase,
    signedTransaction: jws,
    providerIdHint: providerId,
  });

  if (!result.ok) {
    return {
      ok: false,
      applied: false,
      error: result.error ?? "Could not apply Apple subscription.",
      productId: result.productId,
    };
  }

  return { ok: true, applied: true, productId: result.productId };
}
