import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

/**
 * Reference types that reverse a custom-offer wallet debit.
 * Includes abandon refunds (`custom_offer_refund`) and charge.failed refunds
 * (`custom_offer_payment_failed:<paystack_ref>`).
 */
function isCustomOfferWalletCreditReferenceType(referenceType: string | null | undefined): boolean {
  const t = String(referenceType ?? "");
  if (t === "custom_offer_refund") return true;
  if (t.startsWith("custom_offer_payment_failed:")) return true;
  return false;
}

/**
 * Refund outstanding wallet debited for a custom offer when payment is abandoned
 * (cancel-payment) or the offer expires while still payment_pending.
 *
 * Computes outstanding = sum(debits) − sum(prior reversal credits) so multi-attempt
 * retries neither strand a second debit nor double-credit after charge.failed.
 * Idempotent via a per-credit wallet_credit_admin key that includes the outstanding
 * amount fingerprint.
 */
export async function creditWalletForCustomOfferAbandon(
  supabase: SupabaseClient,
  offerId: string,
  customerId: string,
  providerId: string | null,
  options?: { reason?: "cancelled" | "expired" | "failed" },
): Promise<{ credited: number }> {
  const { data: walletRow } = await (supabase.from("user_wallets") as any)
    .select("id, currency")
    .eq("user_id", customerId)
    .maybeSingle();
  if (!walletRow) return { credited: 0 };

  const walletId = (walletRow as { id: string }).id;
  const currency = (walletRow as { currency?: string | null }).currency || "ZAR";

  const { data: txs } = await (supabase.from("wallet_transactions") as any)
    .select("amount, type, reference_type, tenant_id")
    .eq("wallet_id", walletId)
    .eq("reference_id", offerId);

  let debitTotal = 0;
  let creditTotal = 0;
  for (const row of (txs ?? []) as Array<{
    amount?: number | string;
    type?: string;
    reference_type?: string | null;
  }>) {
    const amount = Number(row.amount ?? 0);
    if (row.type === "debit" && String(row.reference_type ?? "") === "custom_offer") {
      debitTotal += amount;
      continue;
    }
    if (row.type === "credit" && isCustomOfferWalletCreditReferenceType(row.reference_type)) {
      creditTotal += amount;
    }
  }

  const outstanding = Math.round((debitTotal - creditTotal) * 100) / 100;
  if (outstanding <= 0) return { credited: 0 };

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });

  const reason = options?.reason ?? "cancelled";
  const description =
    reason === "expired"
      ? "Refund wallet (custom offer expired before payment completed)"
      : reason === "failed"
        ? "Refund wallet (custom offer payment failed)"
        : "Refund wallet (custom offer payment cancelled)";

  // Fingerprint outstanding so a later attempt with a new debit can credit again,
  // while an exact replay of this credit remains idempotent.
  const outstandingCents = Math.round(outstanding * 100);
  const { error: creditError } = await (supabase.rpc as any)("wallet_credit_admin", {
    p_user_id: customerId,
    p_amount: outstanding,
    p_currency: currency,
    p_description: description,
    p_reference_id: offerId,
    p_reference_type: "custom_offer_refund",
    p_tenant_id: financeTenantId,
    p_idempotency_key: `custom_offer_wallet_reversal:${offerId}:${outstandingCents}`,
  });

  if (creditError) {
    throw creditError;
  }

  return { credited: outstanding };
}
