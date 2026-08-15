/**
 * iOS IAP purchase eligibility — server authoritative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";

export { APPLE_BILLING_ACTIVE_STATUSES, isAppleBillingActive } from "@/lib/iap/apple/billing-active";

export type IosPurchaseEligibility = {
  eligible: boolean;
  reason: string | null;
  billing_provider: "paystack" | "apple" | "manual" | null;
};

export async function resolveIosPurchaseEligibility(
  supabase: SupabaseClient,
  providerId: string,
): Promise<IosPurchaseEligibility> {
  const { data: sub } = await supabase
    .from("provider_subscriptions")
    .select("billing_provider, status, paystack_subscription_code, plan:subscription_plans(is_free)")
    .eq("provider_id", providerId)
    .maybeSingle();

  const row = sub as {
    billing_provider?: string | null;
    status?: string | null;
    paystack_subscription_code?: string | null;
    plan?: { is_free?: boolean | null } | null;
  } | null;

  const billingProvider = (row?.billing_provider as IosPurchaseEligibility["billing_provider"]) ?? "paystack";
  const isFree = row?.plan?.is_free === true;
  const hasPaystack =
    Boolean(row?.paystack_subscription_code?.trim()) && billingProvider === "paystack";

  if (billingProvider === "apple") {
    return {
      eligible: true,
      reason: null,
      billing_provider: "apple",
    };
  }

  if (hasPaystack && !isFree && row?.status === "active") {
    return {
      eligible: false,
      reason:
        "Your subscription is billed through our website. Manage billing there to avoid duplicate charges.",
      billing_provider: "paystack",
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
