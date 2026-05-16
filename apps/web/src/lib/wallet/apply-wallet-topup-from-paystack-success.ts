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
  if (topupRow.status === "paid") return;

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

  const { data: markedPaid, error: markError } = await supabase
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

  if (markError || !markedPaid) {
    console.log(`Wallet topup ${topupId} already processed or update failed, skipping credit`);
    return;
  }

  await supabase.rpc("wallet_credit_admin", {
    p_user_id: topupRow.user_id,
    p_amount: amountInCurrency,
    p_currency: currency,
    p_description: `Wallet top up (${currency} ${amountInCurrency})`,
    p_reference_id: topupId,
    p_reference_type: "wallet_topup",
    p_tenant_id: topupWalletTenantId,
  });

  // Record the actual payment receipt for reconciliation
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
