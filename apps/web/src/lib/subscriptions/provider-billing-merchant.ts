/**
 * Single merchant-of-record helpers for provider platform subscriptions.
 * Paystack (Android/web) vs Apple IAP (iOS) must not double-charge or lock each other out.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";
import { disableSubscriptionByCode } from "@/lib/payments/paystack-complete";
import { createRefund } from "@/lib/payments/paystack-complete";

export type ProviderSubscriptionRow = {
  provider_id?: string;
  billing_provider?: string | null;
  status?: string | null;
  paystack_subscription_code?: string | null;
  cancelled_at?: string | null;
  plan?: { is_free?: boolean | null } | null;
};

const LIVE_PAYSTACK_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Paystack webhook/event handlers must no-op when Apple is still merchant of record. */
export function shouldIgnorePaystackEventForRow(
  row: ProviderSubscriptionRow | null | undefined,
): boolean {
  if (!row) return false;
  return isAppleBillingActive(row.billing_provider, row.status);
}

/** Fields applied whenever Paystack activates or renews paid access locally. */
export function paystackActivationFields(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    billing_provider: "paystack",
    paystack_sync_pending: false,
    paystack_sync_note: null,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

/** After Apple expiry, refund, or downgrade to free — allow Android/web Paystack again. */
export function clearAppleMerchantOnFree(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    billing_provider: "paystack",
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

export function computePaidPeriodExpiresAt(
  billingPeriod: "monthly" | "yearly",
  from: Date = new Date(),
): string {
  const expiresAt = new Date(from);
  if (billingPeriod === "yearly") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }
  return expiresAt.toISOString();
}

export async function failPendingProviderSubscriptionOrders(
  supabase: SupabaseClient,
  providerId: string,
  failureReason: string,
): Promise<number> {
  const { data } = await supabase
    .from("provider_subscription_orders")
    .update({
      status: "failed",
      failure_reason: failureReason,
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", providerId)
    .eq("status", "pending")
    .select("id");
  return data?.length ?? 0;
}

export async function disablePaystackSubscriptionForProvider(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string | null,
): Promise<void> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("paystack_subscription_code, tenant_id")
    .eq("provider_id", providerId)
    .maybeSingle();
  const code = (data as { paystack_subscription_code?: string | null } | null)
    ?.paystack_subscription_code?.trim();
  if (!code) return;
  const resolvedTenant =
    tenantId ?? (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  try {
    await disableSubscriptionByCode(code, { tenantId: resolvedTenant });
  } catch (e) {
    console.warn(
      "[provider-billing-merchant] disableSubscriptionByCode failed:",
      providerId,
      e,
    );
  }
}

/** Best-effort refund when Paystack captured a charge but Apple is MoR. */
export async function refundPaystackReferenceIfNeeded(
  reference: string,
  context?: { providerId?: string | null; tenantId?: string | null },
): Promise<void> {
  const ref = reference?.trim();
  if (!ref) return;
  try {
    await createRefund({ transaction: ref });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[provider-billing-merchant] createRefund failed:", ref, e);
    const { slackNotifyProviderSubscriptionAppleRefundFailed } = await import(
      "@/lib/integrations/slack/ops-triggers"
    );
    slackNotifyProviderSubscriptionAppleRefundFailed({
      tenantId: context?.tenantId ?? null,
      providerId: context?.providerId ?? null,
      reference: ref,
      reason: msg,
    });
  }
}

export function isLivePaystackSubscription(row: ProviderSubscriptionRow | null): boolean {
  if (!row) return false;
  if (row.billing_provider === "apple") return false;
  const isFree = row.plan?.is_free === true;
  if (isFree) return false;
  const code = row.paystack_subscription_code?.trim();
  if (!code) return false;
  const status = row.status ?? "";
  if (LIVE_PAYSTACK_STATUSES.has(status)) return true;
  if (status === "active" && row.cancelled_at) return true;
  return false;
}

export async function loadProviderSubscriptionByProviderId(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderSubscriptionRow | null> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select(
      "provider_id, tenant_id, billing_provider, status, paystack_subscription_code, cancelled_at, plan:subscription_plans!plan_id(is_free)",
    )
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as ProviderSubscriptionRow | null) ?? null;
}

export async function loadProviderSubscriptionByPaystackCode(
  supabase: SupabaseClient,
  subscriptionCode: string,
): Promise<(ProviderSubscriptionRow & { provider_id: string }) | null> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select(
      "id, provider_id, tenant_id, billing_provider, status, paystack_subscription_code, cancelled_at, expires_at, plan:subscription_plans!plan_id(is_free)",
    )
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();
  if (!data) return null;
  return data as ProviderSubscriptionRow & { provider_id: string };
}
