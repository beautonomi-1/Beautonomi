import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordProviderSubscriptionPayment,
  returnRecordedPaystackSubscriptionCharge,
} from "@/lib/subscriptions/provider-subscription-payment";
import { computePaidPeriodExpiresAt } from "@/lib/subscriptions/provider-billing-merchant";
import {
  savedCardChargeOwnsPlan,
  savedCardRenewalPeriodAnchorMs,
  savedCardRenewalShouldOpenPeriod,
} from "@/lib/subscriptions/dunning-retry";

/**
 * A saved-card renewal can succeed after the retry job has already moved on.
 * Record that charge and open one period. A period that is already open stays put.
 */
export async function settleDunningSubscriptionCharge(input: {
  supabase: SupabaseClient;
  reference: string;
  providerId: string;
  planId?: string | null;
  subscriptionId?: string | null;
  amountMajor: number;
  feesMajor: number;
  paymentProvider?: "paystack" | "flutterwave";
}): Promise<void> {
  const reference = input.reference.trim();
  const providerId = input.providerId.trim();
  if (!reference || !providerId) return;
  if (!Number.isFinite(input.amountMajor) || input.amountMajor <= 0) return;

  let query = input.supabase
    .from("provider_subscriptions")
    .select("id, provider_id, plan_id, billing_provider, billing_period, expires_at, status, tenant_id");
  const subscriptionId = input.subscriptionId?.trim();
  query = subscriptionId ? query.eq("id", subscriptionId) : query.eq("provider_id", providerId);
  const { data } = await query.maybeSingle();
  const row = data as {
    id?: string;
    provider_id?: string | null;
    plan_id?: string | null;
    billing_provider?: string | null;
    billing_period?: string | null;
    expires_at?: string | null;
    status?: string | null;
    tenant_id?: string | null;
  } | null;
  if (!row?.id) return;

  const paymentProvider = input.paymentProvider ?? "paystack";
  const planProviderId = String(row.provider_id || providerId);
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const openPeriod = savedCardRenewalShouldOpenPeriod(row.status, row.expires_at, nowMs);
  const { data: existingPayment } = await input.supabase
    .from("payment_transactions")
    .select("status")
    .eq("provider", paymentProvider)
    .eq("reference", reference)
    .maybeSingle();
  const existingStatus = String(
    (existingPayment as { status?: string } | null)?.status ?? "",
  ).toLowerCase();
  if (existingStatus === "refunded" || existingStatus === "partially_refunded") return;
  const chargeAlreadyApplied = existingStatus === "success" && !openPeriod;

  if (!savedCardChargeOwnsPlan(paymentProvider, row.billing_provider)) {
    if (paymentProvider === "paystack" && !chargeAlreadyApplied) {
      await returnRecordedPaystackSubscriptionCharge({
        supabase: input.supabase,
        reference,
        providerId: planProviderId,
        tenantId: row.tenant_id ?? null,
        amountMajor: input.amountMajor,
      });
    }
    return;
  }

  if (!openPeriod) {
    if (paymentProvider === "paystack" && existingStatus !== "success") {
      await returnRecordedPaystackSubscriptionCharge({
        supabase: input.supabase,
        reference,
        providerId: planProviderId,
        tenantId: row.tenant_id ?? null,
        amountMajor: input.amountMajor,
      });
    }
    return;
  }
  const billingPeriod = row.billing_period === "yearly" ? "yearly" : "monthly";
  const periodAnchor = new Date(savedCardRenewalPeriodAnchorMs(row.expires_at, nowMs));
  const periodEnd = computePaidPeriodExpiresAt(billingPeriod, periodAnchor);
  const planId = input.planId?.trim() || row.plan_id || null;
  const payment = await recordProviderSubscriptionPayment({
    supabase: input.supabase,
    providerId: planProviderId,
    planId,
    reference,
    amountMajor: input.amountMajor,
    feesMajor: Number.isFinite(input.feesMajor) && input.feesMajor >= 0 ? input.feesMajor : 0,
    kind: "subscription_renewal",
    billingPeriod,
    termEndsAt: periodEnd,
    description: "Subscription renewal (saved card)",
    paymentProvider,
    tenantIdHint: row.tenant_id ?? null,
    updateBillingPeriod: false,
  });
  if (!payment.recorded && !payment.alreadyRecorded) {
    throw new Error("subscription payment was not recorded");
  }
  if (payment.chargeReturned) return;

  const ownerProviders =
    paymentProvider === "flutterwave" ? ["flutterwave"] : ["paystack", "manual"];
  const { data: opened, error } = await input.supabase
    .from("provider_subscriptions")
    .update({
      status: "active",
      past_due_since: null,
      expires_at: periodEnd,
      billing_period_start: periodAnchor.toISOString(),
      billing_period_end: periodEnd,
      last_payment_date: nowIso,
      next_payment_date: periodEnd,
      dunning_retry_count: 0,
      last_dunning_retry_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", row.id)
    .in("billing_provider", ownerProviders)
    .select("id");
  if (error) throw error;
  if (opened?.length) return;
  if (paymentProvider !== "paystack") return;
  await returnRecordedPaystackSubscriptionCharge({
    supabase: input.supabase,
    reference,
    providerId: planProviderId,
    tenantId: row.tenant_id ?? null,
    amountMajor: input.amountMajor,
    financeTransactionId: payment.financeTransactionId,
  });
}
