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
import {
  isAppleBillingActive,
  isPastDueWithinGrace,
  pastDueBillingMessage,
  providerCheckoutFailureMessage,
  subscriptionChargeNotAttempted,
} from "@/lib/iap/apple/billing-active";
import { SUBSCRIPTION_PAST_DUE_GRACE_DAYS } from "@/lib/subscriptions/feature-access";

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

    // !plan_id: scheduled_plan_id is a second FK to subscription_plans (PGRST201).
    const { data: subscription, error: subError } = await supabase
      .from("provider_subscriptions")
      .select(
        "*, plan:subscription_plans!plan_id(id, name, description, price_monthly, price_yearly, currency, features, is_free)"
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
    // billing retry (up to 16 days). A card plan that is still set to renew
    // stays active until the renewal job records success or past_due; expiring
    // it here would skip the 3-day grace window. Cancel-at-period-end and
    // auto_renew off still lapse, matching the expire cron.
    const expiresAt = (subscription as any).expires_at
      ? new Date((subscription as any).expires_at)
      : null;
    const renewalStillExpected =
      (subscription as { auto_renew?: boolean | null }).auto_renew !== false &&
      !sub.cancelled_at;
    if (
      (subscription as any).status === "active" &&
      expiresAt &&
      expiresAt < new Date() &&
      sub.billing_provider !== "apple" &&
      !renewalStillExpected
    ) {
      const { resolveCatalogPlanIdForProviderSubscription } = await import(
        "@/lib/subscriptions/ensure-provider-free-subscription"
      );
      const { clearAppleMerchantOnFree, stopPaystackSubscriptionBeforeClear } = await import(
        "@/lib/subscriptions/provider-billing-merchant"
      );
      const freePlanId = await resolveCatalogPlanIdForProviderSubscription(supabase);
      const nowIso = new Date().toISOString();
      const paystackStop = await stopPaystackSubscriptionBeforeClear({
        supabase,
        code: (subscription as { paystack_subscription_code?: string | null }).paystack_subscription_code,
        tenantId: (subscription as { tenant_id?: string | null }).tenant_id,
        providerId,
      });
      await (supabase.from("provider_subscriptions") as any)
        .update({
          status: "expired",
          auto_renew: false,
          past_due_since: null,
          next_payment_date: null,
          ...(paystackStop === "kept"
            ? {
                paystack_sync_pending: true,
                paystack_sync_note:
                  "We could not stop automatic billing. Contact support if charges continue.",
              }
            : { paystack_subscription_code: null, paystack_sync_pending: false, paystack_sync_note: null }),
          ...(freePlanId ? { plan_id: freePlanId } : {}),
          ...clearAppleMerchantOnFree(),
          updated_at: nowIso,
        })
        .eq("id", (subscription as any).id);
      sub.status = "expired";
      sub.plan_id = freePlanId ?? sub.plan_id;
      if (freePlanId && sub.plan && sub.plan.id !== freePlanId) {
        const { data: freePlan } = await supabase
          .from("subscription_plans")
          .select("id, name, description, price_monthly, price_yearly, currency, features, is_free")
          .eq("id", freePlanId)
          .maybeSingle();
        if (freePlan) sub.plan = freePlan as Record<string, unknown>;
      }
      if (!currentPlanIsFree && freePlanId) {
        try {
          const { enforceStaffCapForProviderPlan } = await import(
            "@/lib/provider/enforce-staff-cap-after-downgrade"
          );
          await enforceStaffCapForProviderPlan(providerId);
        } catch (capErr) {
          console.error("[provider/subscription] staff cap after lapse failed:", capErr);
        }
      }
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

    const checkoutIssueOnFree =
      currentPlanIsFree &&
      (effectiveOrder?.status === "pending" || effectiveOrder?.status === "failed");

    const pendingUpgradePlanIdEarly = (subscription as {
      pending_upgrade_plan_id?: string | null;
    }).pending_upgrade_plan_id?.trim();
    const trialChargePending = subscriptionChargeNotAttempted(
      subscription as {
        billing_provider?: string | null;
        last_dunning_retry_at?: string | null;
        dunning_retry_count?: number | null;
        trial_ends_at?: string | null;
      },
    );

    const billingIssue = checkoutIssueOnFree
      ? effectiveOrder?.status === "failed"
        ? {
            type: "payment_failed",
            message:
              providerCheckoutFailureMessage(effectiveOrder.failure_reason) ||
              "Your subscription payment was not completed. This can happen when the card has insufficient funds or the bank declines the charge.",
            action: "retry_payment",
          }
        : {
            type: "payment_pending",
            message:
              "Your subscription checkout is still pending. Complete payment to activate the selected plan.",
            action: "complete_payment",
          }
      : currentPlanIsFree
      ? pendingUpgradePlanIdEarly
        ? {
            type: "upgrade_pending",
            message:
              "You selected a paid plan during onboarding. Finish checkout to unlock it.",
            action: "complete_payment",
          }
        : null
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
            message: pastDueBillingMessage(
              sub.billing_provider,
              isPastDueWithinGrace({
                billingProvider: sub.billing_provider,
                pastDueSince: (subscription as { past_due_since?: string | null }).past_due_since,
                updatedAt: (subscription as { updated_at?: string | null }).updated_at,
                appleGracePeriodExpiresAt: (subscription as { apple_grace_period_expires_at?: string | null })
                  .apple_grace_period_expires_at,
                nowIso: new Date().toISOString(),
                graceCutoffIso: new Date(
                  Date.now() - SUBSCRIPTION_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
                ).toISOString(),
              }),
              trialChargePending,
            ),
            action: sub.billing_provider === "apple"
              ? "manage_apple"
              : trialChargePending
                ? "charge_pending"
                : "pay_now",
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
                  providerCheckoutFailureMessage(effectiveOrder.failure_reason) ||
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

    const scheduledPlanId = (subscription as { scheduled_plan_id?: string | null }).scheduled_plan_id ?? null;
    let scheduled_plan: { id: string; name: string | null } | null = null;
    if (scheduledPlanId) {
      const { data: scheduledPlanRow } = await supabase
        .from("subscription_plans")
        .select("id, name")
        .eq("id", scheduledPlanId)
        .maybeSingle();
      if (scheduledPlanRow) {
        scheduled_plan = {
          id: String((scheduledPlanRow as { id: string }).id),
          name: (scheduledPlanRow as { name?: string | null }).name ?? null,
        };
      }
    }

    const { appleIapEnabledFromEnv } = await import("@/lib/iap/apple/config");

    const pendingPlanId = (subscription as {
      pending_upgrade_plan_id?: string | null;
      pending_upgrade_billing_period?: string | null;
      pending_upgrade_set_at?: string | null;
    }).pending_upgrade_plan_id?.trim();
    const pendingBillingPeriod = (subscription as {
      pending_upgrade_billing_period?: string | null;
    }).pending_upgrade_billing_period;
    let pending_upgrade: {
      plan_id: string;
      billing_period: "monthly" | "yearly";
      plan_name: string | null;
      set_at: string | null;
    } | null = null;
    if (
      pendingPlanId &&
      (pendingBillingPeriod === "monthly" || pendingBillingPeriod === "yearly")
    ) {
      const { data: pendingPlanRow } = await supabase
        .from("subscription_plans")
        .select("name")
        .eq("id", pendingPlanId)
        .maybeSingle();
      pending_upgrade = {
        plan_id: pendingPlanId,
        billing_period: pendingBillingPeriod,
        plan_name: (pendingPlanRow as { name?: string | null } | null)?.name ?? null,
        set_at:
          (subscription as { pending_upgrade_set_at?: string | null }).pending_upgrade_set_at ??
          null,
      };
    }

    return successResponse({
      ...(subscription as any),
      status: sub.status,
      latest_order: effectiveOrder,
      billing_issue: billingIssue,
      scheduled_plan,
      pending_upgrade,
      ios_purchase_eligible: iosPurchaseEligible.eligible,
      ios_purchase_eligible_reason: iosPurchaseEligible.reason,
      billing_provider: sub.billing_provider ?? "paystack",
      apple_iap_enabled: appleIapEnabledFromEnv(),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch subscription");
  }
}
