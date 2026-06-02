/**
 * Shared wallet top-up completion after a successful Paystack charge (webhook + /api/paystack/verify).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

async function lastResortCurrencyFromTenantId(tenantId: string | null | undefined): Promise<string> {
  if (tenantId) {
    const tr = await getTenantRegionConfig(tenantId);
    return tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  }
  return LAST_RESORT_CURRENCY;
}

export type WalletTopupPaystackPayload = {
  reference: string;
  metadata: { wallet_topup_id?: string; tenant_id?: string; [k: string]: unknown };
  amount: number;
};

/**
 * Idempotent: marks wallet_topups paid and credits user wallet (same as Paystack webhook path).
 */
export async function applyWalletTopupFromSuccessfulPaystackCharge(
  payload: WalletTopupPaystackPayload,
  supabase: SupabaseClient,
): Promise<void> {
  const topupId = payload.metadata.wallet_topup_id as string | undefined;
  if (!topupId) return;

  const { data: topup } = await supabase.from("wallet_topups").select("*").eq("id", topupId).single();
  if (!topup) return;

  type TopupRow = { status?: string; currency?: string; user_id?: string; tenant_id?: string | null };
  const topupRow = topup as TopupRow;
  const enteredPaid = topupRow.status === "paid";

  // Primary idempotency guard: if the wallet was already credited for this
  // top-up (ledger row exists), there is nothing to do. This is reliable even
  // when verify and the webhook race each other after a successful charge.
  const { data: existingCredit } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("reference_id", topupId)
    .eq("reference_type", "wallet_topup")
    .limit(1)
    .maybeSingle();
  if (existingCredit) return;

  let resolvedTenantId = topupRow.tenant_id ?? null;
  const metaTenant = payload.metadata?.tenant_id as string | undefined;
  if (!resolvedTenantId && metaTenant) resolvedTenantId = metaTenant;
  if (!resolvedTenantId && topupRow.user_id) {
    const { data: urow } = await supabase
      .from("users")
      .select("preferred_home_tenant_id")
      .eq("id", topupRow.user_id)
      .maybeSingle();
    resolvedTenantId = (urow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ?? null;
  }

  const amountInCurrency = convertFromSmallestUnit(payload.amount || 0);
  const currency = topupRow.currency ?? (await lastResortCurrencyFromTenantId(resolvedTenantId));

  const topupWalletTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: resolvedTenantId,
    provider_id: null,
  });

  // Atomically claim the pending -> paid transition. The single winner credits.
  const { data: claimed } = await supabase
    .from("wallet_topups")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paystack_reference: payload.reference,
      updated_at: new Date().toISOString(),
      tenant_id: topupWalletTenantId,
    })
    .eq("id", topupId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // We lost the atomic claim. If the top-up was still pending on entry, a
    // concurrent caller (verify vs webhook) won the race and will credit — so
    // we must NOT credit again. Only heal a genuinely stranded top-up that was
    // already marked paid on entry but, due to an earlier failure, never got a
    // wallet credit (the ledger guard above already proved none exists).
    if (!enteredPaid) return;
    await supabase
      .from("wallet_topups")
      .update({ paystack_reference: payload.reference, updated_at: new Date().toISOString() })
      .eq("id", topupId);
    console.warn(`[wallet_topup] Healing stranded paid top-up without credit: ${topupId}`);
  }

  const { error: creditError } = await supabase.rpc("wallet_credit_admin", {
    p_user_id: topupRow.user_id,
    p_amount: amountInCurrency,
    p_currency: currency,
    p_description: `Wallet top up (${currency} ${amountInCurrency})`,
    p_reference_id: topupId,
    p_reference_type: "wallet_topup",
    p_tenant_id: topupWalletTenantId,
    // DB-level idempotency: even if the stranded-paid heal path runs concurrently
    // with another caller, the credit is applied at most once for this top-up.
    p_idempotency_key: `wallet_topup:${topupId}`,
  });
  // Do NOT swallow a failed credit. The top-up is already marked paid above, so
  // a silent failure here is the "I paid but my balance never moved" bug. Throw
  // so the verify endpoint / webhook reports failure and retries — the ledger
  // idempotency guard + stranded-paid healing above re-credit safely on retry.
  if (creditError) {
    console.error(
      `[wallet_topup] wallet_credit_admin failed for top-up ${topupId}:`,
      creditError.message,
    );
    throw new Error(`Wallet credit failed for top-up ${topupId}: ${creditError.message}`);
  }

  // Record the actual payment receipt for reconciliation (skip if already recorded).
  const { data: existingReceipt } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("reference", payload.reference)
    .eq("transaction_type", "wallet_topup")
    .limit(1)
    .maybeSingle();
  if (!existingReceipt) {
    await supabase.from("payment_transactions").insert({
      booking_id: null,
      reference: payload.reference,
      amount: amountInCurrency,
      fees: 0,
      net_amount: amountInCurrency,
      status: "success",
      provider: "paystack",
      transaction_type: "wallet_topup",
      metadata: payload.metadata,
      created_at: new Date().toISOString(),
    });
  }

  // Record in finance_transactions so the double-entry shadow ledger posts DR Cash / CR Wallet Liability.
  // F21: unique index on description — concurrent webhooks treat 23505 as benign.
  const { error: finErr } = await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: null,
    tenant_id: topupWalletTenantId,
    transaction_type: "wallet_topup",
    amount: amountInCurrency,
    fees: 0,
    commission: 0,
    net: amountInCurrency,
    description: `Wallet topup: ${topupId}`,
    created_at: new Date().toISOString(),
  });
  if (finErr) {
    const msg = String((finErr as { message?: string }).message || finErr || "");
    const code = String((finErr as { code?: string }).code || "");
    if (code === "23505" || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return;
    }
    console.error("[wallet_topup] finance_transactions insert failed:", finErr);
  }
}
