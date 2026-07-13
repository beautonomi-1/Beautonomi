import type { ApiError } from "@beautonomi/types";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { getSubscriptionPaystackReturnUrl } from "@/lib/payments/providerPaystackReturn";

export type BillingPeriod = "monthly" | "yearly";

export type PaidCheckoutStartResult =
  | {
      ok: true;
      authorizationUrl: string;
      orderId?: string;
      reference?: string;
      alreadyActive?: boolean;
    }
  | { ok: false; error: string; errorCode?: string | null; status?: number };

export function defaultBillingPeriod(
  periods: BillingPeriod[] | null | undefined,
): BillingPeriod {
  if (periods?.includes("monthly")) return "monthly";
  if (periods?.includes("yearly")) return "yearly";
  return "monthly";
}

/**
 * Resolve the bare `subscription_plans.id` for checkout.
 * Prefers the onboarding completion payload; falls back to pricing plan detail.
 */
export async function resolveSubscriptionPlanIdForCheckout(options: {
  selectedSubscriptionPlanId?: string | null;
  pricingPlanId?: string | null;
}): Promise<string | null> {
  const fromCompletion = options.selectedSubscriptionPlanId?.trim();
  if (fromCompletion) return fromCompletion;

  const pricingPlanId = options.pricingPlanId?.trim();
  if (!pricingPlanId) return null;

  const res = await api.get<{ subscription_plan_id?: string | null }>(
    `/api/public/pricing/plans/${encodeURIComponent(pricingPlanId)}`,
  );
  if (res.error) return null;
  const linked = res.data?.subscription_plan_id?.trim();
  return linked || null;
}

/**
 * Start paid subscription checkout — same sequence as Settings → Plan & Billing → Upgrade:
 * `subscription/upgrade` (no saved card auth) → `initialize-payment` (amount-based Paystack init).
 */
export async function startPaidSubscriptionCheckout(options: {
  subscriptionPlanId: string;
  billingPeriod: BillingPeriod;
  inApp?: boolean;
}): Promise<PaidCheckoutStartResult> {
  const { subscriptionPlanId, billingPeriod, inApp = true } = options;

  const upRes = await api.post<{
    is_free?: boolean;
    subscription_id?: string;
    requires_payment?: boolean;
    payment_url?: string;
    authorization_url?: string;
  }>("/api/provider/subscription/upgrade", {
    plan_id: subscriptionPlanId,
    billing_period: billingPeriod,
  });

  if (upRes.error) {
    const apiErr = upRes.error as ApiError;
    return {
      ok: false,
      error: getApiErrorMessage(apiErr, "Unable to start subscription checkout"),
      errorCode: apiErr.code ?? null,
      status: apiErr.status,
    };
  }

  const upgraded = upRes.data;
  if (upgraded?.is_free) {
    return { ok: true, authorizationUrl: "", alreadyActive: true };
  }
  if (upgraded?.subscription_id && !upgraded?.requires_payment) {
    return { ok: true, authorizationUrl: "", alreadyActive: true };
  }

  const upUrl = upgraded?.authorization_url ?? upgraded?.payment_url;
  if (upUrl) {
    return { ok: true, authorizationUrl: upUrl };
  }

  const initRes = await api.post<{
    authorization_url?: string;
    payment_url?: string;
    order_id?: string;
    reference?: string;
  }>("/api/provider/subscription/initialize-payment", {
    plan_id: subscriptionPlanId,
    billing_period: billingPeriod,
    in_app: inApp,
    callback_url: getSubscriptionPaystackReturnUrl(),
  });

  if (initRes.error) {
    const apiErr = initRes.error as ApiError;
    return {
      ok: false,
      error: getApiErrorMessage(apiErr, "Unable to start subscription checkout"),
      errorCode: apiErr.code ?? null,
      status: apiErr.status,
    };
  }

  const url = initRes.data?.authorization_url ?? initRes.data?.payment_url;
  if (!url) {
    return {
      ok: false,
      error: "Paystack did not return a checkout URL. Please try again or contact support.",
    };
  }

  return {
    ok: true,
    authorizationUrl: url,
    orderId: typeof initRes.data?.order_id === "string" ? initRes.data.order_id : undefined,
    reference:
      typeof initRes.data?.reference === "string" ? initRes.data.reference : undefined,
  };
}
