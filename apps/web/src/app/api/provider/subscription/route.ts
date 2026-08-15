import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getDisplayFeatureBulletsForSubscriptionPlans } from "@/lib/subscription/pricing-plan-display-features";
import { resolveIosPurchaseEligibility } from "@/lib/iap/apple/ios-eligibility";
import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";

/**
 * GET /api/provider/subscription
 *
 * Get provider's subscription information
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return successResponse(null);
    }

    const { data: subscription, error: subError } = await supabase
      .from("provider_subscriptions")
      .select(
        "*, plan:subscription_plans(id, name, description, price_monthly, price_yearly, currency, features, is_free)"
      )
      .eq("provider_id", providerId)
      .maybeSingle();

    if (subError) {
      throw subError;
    }

    if (!subscription) return successResponse(null);

    const sub = subscription as {
      status?: string;
      plan_id?: string | null;
      cancelled_at?: string | null;
      paystack_sync_pending?: boolean | null;
      paystack_sync_note?: string | null;
      billing_provider?: string | null;
      apple_price_increase_status?: string | null;
      plan?: Record<string, unknown>;
    };
    const currentPlanIsFree = sub.plan?.is_free === true;
    if (sub.plan && typeof sub.plan.id === "string") {
      let tenantId: string | null = null;
      try {
        tenantId = await resolveTenantIdWithZaFallback(request);
      } catch {
        tenantId = null;
      }
      const bulletMap = await getDisplayFeatureBulletsForSubscriptionPlans(supabase, tenantId, [
        sub.plan.id,
      ]);
      const feature_bullets = bulletMap.get(sub.plan.id) ?? [];
      sub.plan = { ...sub.plan, feature_bullets };
    }

    // Auto-mark expired if past expires_at (best-effort). Apple-billed rows are
    // owned by ASN + reconcile: expires_at can lapse while Apple is still in
    // billing retry (up to 16 days). Flipping those to expired here would drop
    // paid features before DID_FAIL_TO_RENEW / EXPIRED arrives.
    const expiresAt = (subscription as any).expires_at
      ? new Date((subscription as any).expires_at)
      : null;
    if (
      (subscription as any).status === "active" &&
      expiresAt &&
      expiresAt < new Date() &&
      sub.billing_provider !== "apple"
    ) {
      await (supabase.from("provider_subscriptions") as any)
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", (subscription as any).id);
      sub.status = "expired";
    }

    const { data: latestOrder } = await supabase
      .from("provider_subscription_orders")
      .select(
        "id, plan_id, billing_period, amount, currency, status, paystack_reference, paid_at, failed_at, failure_reason, created_at, updated_at"
      )
      .eq("provider_id", providerId)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const order = latestOrder as {
      id: string;
      plan_id?: string | null;
      billing_period?: string | null;
      amount?: number | string | null;
      currency?: string | null;
      status?: string | null;
      paystack_reference?: string | null;
      paid_at?: string | null;
      failed_at?: string | null;
      failure_reason?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    } | null;

    const hasCleanActivePaidPlan =
      !currentPlanIsFree &&
      sub.status === "active" &&
      !sub.paystack_sync_pending;
    const effectiveOrder = hasCleanActivePaidPlan && order?.plan_id === sub.plan_id ? null : order;

    const billingIssue = currentPlanIsFree
      ? null
      : isAppleBillingActive(sub.billing_provider, sub.status) &&
          sub.apple_price_increase_status === "pending"
        ? {
            type: "apple_price_increase",
            message:
              "Apple needs you to accept a price increase to keep this plan renewing. Open Apple ID → Subscriptions to consent or switch plans.",
            action: "manage_apple",
          }
        : sub.status === "past_due"
        ? {
            type: "past_due",
            message:
              sub.billing_provider === "apple"
                ? "Apple could not renew this plan. Update the payment method on your Apple ID to keep premium features."
                : "Your last subscription payment did not go through. Update your card or pay now to keep premium features active.",
            action: sub.billing_provider === "apple" ? "manage_apple" : "pay_now",
          }
        : sub.paystack_sync_pending
          ? {
              type: "sync_pending",
              message:
                sub.paystack_sync_note?.trim() ||
                "Your plan changed but billing still needs to be confirmed. Complete payment or update your card to finish setup.",
              action: "update_payment",
            }
          : effectiveOrder?.status === "failed"
            ? {
                type: "payment_failed",
                message:
                  effectiveOrder.failure_reason?.trim() ||
                  "Your subscription payment was not completed. This can happen when the card has insufficient funds or the bank declines the charge.",
                action: "retry_payment",
              }
            : effectiveOrder?.status === "pending"
              ? {
                  type: "payment_pending",
                  message:
                    "Your subscription checkout is still pending. Complete payment to activate the selected plan.",
                  action: "complete_payment",
                }
              : null;

    const iosPurchaseEligible = await resolveIosPurchaseEligibility(supabase, providerId);

    return successResponse({
      ...(subscription as any),
      status: sub.status,
      latest_order: effectiveOrder,
      billing_issue: billingIssue,
      ios_purchase_eligible: iosPurchaseEligible.eligible,
      ios_purchase_eligible_reason: iosPurchaseEligible.reason,
      billing_provider: iosPurchaseEligible.billing_provider,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch subscription");
  }
}
