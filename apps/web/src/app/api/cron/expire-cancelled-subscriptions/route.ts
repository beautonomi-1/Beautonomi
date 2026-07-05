/**
 * GET /api/cron/expire-cancelled-subscriptions
 *
 * Transitions provider subscriptions through their lifecycle:
 * 1. cancelled_at IS NOT NULL + status='active' + expires_at passed → status='expired' (cancel-at-period-end)
 * 2. auto_renew=false + status='active' + expires_at passed + not cancelled → status='expired'
 * 3. status='past_due' + past 3-day grace period + expires_at passed → status='expired'
 *
 * Runs daily via Vercel cron (02:00 UTC).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { resolveCatalogPlanIdForProviderSubscription } from "@/lib/subscriptions/ensure-provider-free-subscription";
import { repairSubscriptionPlanFromPayments } from "@/lib/subscriptions/repair-subscription-plan-from-payments";

const PAST_DUE_GRACE_DAYS = 3;

export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    // Resolve the free catalog plan so an expiring paid subscription falls back
    // to free cleanly — plan_id, the UI, and entitlement resolvers all agree
    // (no lingering paid plan name on a lapsed account). When this cannot be
    // resolved we still expire, and the resolvers' status-based free fallback
    // keeps entitlements correct.
    const freePlanId = await resolveCatalogPlanIdForProviderSubscription(supabase);
    const expirePatch = (extra?: Record<string, unknown>) => ({
      status: "expired" as const,
      auto_renew: false,
      paystack_subscription_code: null,
      next_payment_date: null,
      ...(freePlanId ? { plan_id: freePlanId } : {}),
      updated_at: now,
      ...(extra ?? {}),
    });

    // 1. Cancel-at-period-end: cancelled_at set while still active; expire when billing period ends
    const { data: expired, error } = await supabase
      .from("provider_subscriptions")
      .update(expirePatch())
      .eq("status", "active")
      .not("cancelled_at", "is", null)
      .lt("expires_at", now)
      .select("id, provider_id");

    if (error) {
      console.error("Error expiring cancelled subscriptions:", error);
      return handleApiError(error, "Failed to expire cancelled subscriptions");
    }

    const count = expired?.length ?? 0;
    if (count > 0) {
      console.log(`Expired ${count} cancelled subscriptions:`, expired?.map((s) => s.id));
    }

    // 2. Expire subscriptions that have passed their expiry without cancellation
    // (e.g. failed payment renewals where auto_renew was left true)
    const { data: naturalExpired, error: naturalError } = await supabase
      .from("provider_subscriptions")
      .update(expirePatch())
      .eq("status", "active")
      .is("cancelled_at", null)
      .eq("auto_renew", false)
      .lt("expires_at", now)
      .select("id, provider_id");

    if (naturalError) {
      console.error("Error expiring naturally-ended subscriptions:", naturalError);
    }

    const naturalCount = naturalExpired?.length ?? 0;
    if (naturalCount > 0) {
      console.log(`Expired ${naturalCount} naturally-ended subscriptions:`, naturalExpired?.map((s) => s.id));
    }

    // 3. Expire past_due subscriptions that have exceeded the grace period.
    // A subscription enters past_due when a renewal payment fails. We allow a 3-day
    // grace window (from updated_at, which is set when status changes to past_due)
    // before revoking access.
    const graceCutoff = new Date(Date.now() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: pastDueExpired, error: pastDueError } = await supabase
      .from("provider_subscriptions")
      .update(expirePatch())
      .eq("status", "past_due")
      .lt("updated_at", graceCutoff)
      .lt("expires_at", now)
      .select("id, provider_id");

    if (pastDueError) {
      console.error("Error expiring past-due subscriptions:", pastDueError);
    }

    const pastDueCount = pastDueExpired?.length ?? 0;
    if (pastDueCount > 0) {
      console.log(`Expired ${pastDueCount} past-due subscriptions past grace period:`, pastDueExpired?.map((s) => s.id));
    }

    // Notify affected providers about their expired subscriptions
    const allExpired = [
      ...(expired ?? []).map((s) => ({ ...s, reason: "cancelled_at_period_end" as const })),
      ...(naturalExpired ?? []).map((s) => ({ ...s, reason: "expired" as const })),
      ...(pastDueExpired ?? []).map((s) => ({ ...s, reason: "payment_failed" as const })),
    ];

    let notified = 0;
    if (allExpired.length > 0) {
      const providerIds = [...new Set(allExpired.map((s) => s.provider_id))];
      const { data: providers } = await supabase
        .from("providers")
        .select("id, user_id, business_name")
        .in("id", providerIds);

      const providerMap = new Map(
        (providers ?? []).map((p: any) => [p.id, { userId: p.user_id, name: p.business_name }])
      );

      for (const sub of allExpired) {
        const prov = providerMap.get(sub.provider_id);
        if (!prov?.userId) continue;

        try {
          const reasonMsg = sub.reason === "cancelled_at_period_end"
            ? "Your subscription has been cancelled as the billing period ended."
            : sub.reason === "payment_failed"
              ? "Your subscription has expired due to unsuccessful payment renewal."
              : "Your subscription has expired. Renew to keep your premium features.";

          await insertNotification({
            user_id: prov.userId,
            type: "system",
            title: "Subscription Expired",
            message: reasonMsg,
            data: { subscription_id: sub.id, reason: sub.reason },
            action_url: "/settings/subscription",
          });

          await sendTemplateNotification(
            "subscription_expired",
            [prov.userId],
            {
              business_name: prov.name || "",
              reason: sub.reason,
            },
            ["push"],
            // In-app bell row inserted manually above; skip template auto-insert.
            { appType: "provider", skipInApp: true }
          );

          notified++;
        } catch (notifErr) {
          console.error(`Failed to notify provider ${sub.provider_id} about subscription expiry:`, notifErr);
        }
      }
    }

    let subscriptionPlansRepaired = 0;
    const { data: tenants } = await supabase.from("tenants").select("id");
    for (const tenant of tenants ?? []) {
      const tenantId = String((tenant as { id?: string }).id ?? "");
      if (!tenantId) continue;
      try {
        subscriptionPlansRepaired += await repairSubscriptionPlanFromPayments(supabase, tenantId);
      } catch (repairErr) {
        console.error(`Subscription plan repair failed for tenant ${tenantId}:`, repairErr);
      }
    }

    return successResponse({
      cancelled_expired: count,
      naturally_expired: naturalCount,
      past_due_expired: pastDueCount,
      providers_notified: notified,
      subscription_plans_repaired: subscriptionPlansRepaired,
    });
  } catch (error) {
    return handleApiError(error, "Cron: expire-cancelled-subscriptions failed");
  }
}
