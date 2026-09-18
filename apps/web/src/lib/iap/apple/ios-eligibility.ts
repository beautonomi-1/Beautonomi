/**
 * iOS IAP purchase eligibility — server authoritative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";
import { isLivePaystackSubscription } from "@/lib/subscriptions/provider-billing-merchant";

export { APPLE_BILLING_ACTIVE_STATUSES, isAppleBillingActive } from "@/lib/iap/apple/billing-active";

export type IosPurchaseEligibility = {
  eligible: boolean;
  reason: string | null;
  billing_provider: "paystack" | "apple" | "manual" | null;
};

const WEBSITE_BILLED_MESSAGE =
  "Your subscription is billed through our website. Manage billing there to avoid duplicate charges.";

const PENDING_CHECKOUT_MESSAGE =
  "You have a subscription checkout in progress on the website or Android app. Complete or cancel it before starting an App Store purchase.";

export async function resolveIosPurchaseEligibility(
  supabase: SupabaseClient,
  providerId: string,
): Promise<IosPurchaseEligibility> {
  const { data: sub } = await supabase
    .from("provider_subscriptions")
    .select(
      "billing_provider, status, paystack_subscription_code, cancelled_at, plan:subscription_plans!plan_id(is_free)",
    )
    .eq("provider_id", providerId)
    .maybeSingle();

  const row = sub as {
    billing_provider?: string | null;
    status?: string | null;
    paystack_subscription_code?: string | null;
    cancelled_at?: string | null;
    plan?: { is_free?: boolean | null } | null;
  } | null;

  const billingProvider =
    (row?.billing_provider as IosPurchaseEligibility["billing_provider"]) ?? "paystack";

  if (isAppleBillingActive(row?.billing_provider, row?.status)) {
    return {
      eligible: true,
      reason: null,
      billing_provider: "apple",
    };
  }

  if (isLivePaystackSubscription(row)) {
    return {
      eligible: false,
      reason: WEBSITE_BILLED_MESSAGE,
      billing_provider: billingProvider,
    };
  }

  const { data: pendingOrder } = await supabase
    .from("provider_subscription_orders")
    .select("id")
    .eq("provider_id", providerId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (pendingOrder) {
    return {
      eligible: false,
      reason: PENDING_CHECKOUT_MESSAGE,
      billing_provider: billingProvider,
    };
  }

  return {
    eligible: true,
    reason: null,
    billing_provider: billingProvider,
  };
}

export const APPLE_BILLING_ACTIVE_MESSAGE =
  "This plan is billed through the App Store. Manage, change, or cancel it in Apple ID → Subscriptions to avoid a second charge.";

/**
 * Paystack checkout is forbidden while Apple is still the merchant of record.
 * Applies to Android, web, and any client that hits upgrade / initialize-payment.
 */
export async function getAppleBillingPaystackBlock(
  supabase: SupabaseClient,
  providerId: string,
): Promise<{ blocked: true; message: string } | { blocked: false }> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("billing_provider, status")
    .eq("provider_id", providerId)
    .maybeSingle();
  const row = data as { billing_provider?: string | null; status?: string | null } | null;
  if (!isAppleBillingActive(row?.billing_provider, row?.status)) return { blocked: false };
  return { blocked: true, message: APPLE_BILLING_ACTIVE_MESSAGE };
}
