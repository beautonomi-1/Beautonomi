import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { addMoney, roundCurrency, subtractMoney, toMinorUnits } from "@beautonomi/utils";

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
export async function getCustomOfferWalletOutstanding(
  supabase: SupabaseClient,
  offerId: string,
  customerId: string,
): Promise<{ outstanding: number; currency: string } | null> {
  const { data: walletRow } = await (supabase.from("user_wallets") as any)
    .select("id, currency")
    .eq("user_id", customerId)
    .maybeSingle();
  if (!walletRow) return null;

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
      debitTotal = addMoney(debitTotal, amount, currency);
      continue;
    }
    if (row.type === "credit" && isCustomOfferWalletCreditReferenceType(row.reference_type)) {
      creditTotal = addMoney(creditTotal, amount, currency);
    }
  }

  return { outstanding: subtractMoney(debitTotal, creditTotal, currency), currency };
}

export async function creditWalletForCustomOfferAbandon(
  supabase: SupabaseClient,
  offerId: string,
  customerId: string,
  providerId: string | null,
  options?: { reason?: "cancelled" | "expired" | "failed" },
): Promise<{ credited: number }> {
  const held = await getCustomOfferWalletOutstanding(supabase, offerId, customerId);
  if (!held) return { credited: 0 };
  const { outstanding, currency } = held;
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
  const outstandingCents = toMinorUnits(outstanding, currency);
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

export const CUSTOM_OFFER_WALLET_STILL_DUE = "custom_offer_wallet_refund_still_due";

export async function rememberCustomOfferWalletStillDue(
  supabase: SupabaseClient,
  offerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("custom_offers")
    .update({
      payment_reference: CUSTOM_OFFER_WALLET_STILL_DUE,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);
  if (error) {
    console.error("[custom offer] could not mark the wallet return", offerId, error);
  }
}

export async function retryCustomOfferWalletStillDue(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("custom_offers")
    .select("id, provider_id, request:custom_requests(customer_id)")
    .eq("payment_reference", CUSTOM_OFFER_WALLET_STILL_DUE)
    .limit(100);
  if (error) {
    console.warn("[custom offer] wallet return query failed", error);
    return 0;
  }

  let finished = 0;
  for (const row of (data ?? []) as Array<{
    id: string;
    provider_id?: string | null;
    request?: { customer_id?: string | null } | null;
  }>) {
    const customerId = row.request?.customer_id;
    if (!customerId) continue;
    try {
      await creditWalletForCustomOfferAbandon(supabase, row.id, customerId, row.provider_id ?? null, {
        reason: "failed",
      });
      const { data: cleared } = await supabase
        .from("custom_offers")
        .update({ payment_reference: null, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("payment_reference", CUSTOM_OFFER_WALLET_STILL_DUE)
        .select("id");
      if ((cleared?.length ?? 0) > 0) finished += 1;
    } catch (err) {
      console.warn("[custom offer] wallet return still due", row.id, err);
    }
  }
  return finished;
}
