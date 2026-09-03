/**
 * GET /api/cron/expire-cancelled-subscriptions
 *
 * Transitions provider subscriptions through their lifecycle:
 * 1. cancelled_at IS NOT NULL + status='active' + expires_at passed → status='expired' (cancel-at-period-end)
 * 2. auto_renew=false + status='active' + expires_at passed + not cancelled → status='expired'
 * 3. status='past_due' + past 3-day grace period + expires_at passed → status='expired'
 *    Apple-billed past_due is excluded from that 3-day cut: Apple retries for up
 *    to 16 days and publishes the deadline as apple_grace_period_expires_at.
 *    Those rows expire only after that StoreKit window ends (ASN EXPIRED and
 *    reconcile remain the source of truth if grace was never set).
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
import { enforceStaffCapForProviderPlan } from "@/lib/provider/enforce-staff-cap-after-downgrade";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

async function enforceStaffCapsForProviders(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  providerIds: Array<string | null | undefined>,
): Promise<number> {
  const unique = [...new Set(providerIds.filter((id): id is string => Boolean(id)))];
  let enforced = 0;
  for (const providerId of unique) {
    try {
      await enforceStaffCapForProviderPlan(providerId, { admin: supabase });
      enforced++;
    } catch (err) {
      console.warn("[expire-cancelled-subscriptions] enforceStaffCap failed:", providerId, err);
    }
  }
  return enforced;
}

const PAST_DUE_GRACE_DAYS = 3;
const JOB_NAME = "expire-cancelled-subscriptions";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

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

    // 0a. Apply scheduled paid-to-paid downgrades at period end (no proration).
    const { data: scheduledRows } = await supabase
      .from("provider_subscriptions")
      .select("id, provider_id, scheduled_plan_id, scheduled_change_at, plan_id")
      .not("scheduled_plan_id", "is", null)
      .not("scheduled_change_at", "is", null)
      .lte("scheduled_change_at", now)
      .in("status", ["active", "trialing"]);

    let downgradesApplied = 0;
    const downgradedProviderIds: string[] = [];
    for (const row of scheduledRows ?? []) {
      const r = row as { id: string; provider_id?: string; scheduled_plan_id: string; plan_id: string };
      await supabase
        .from("provider_subscriptions")
        .update({
          plan_id: r.scheduled_plan_id,
          scheduled_plan_id: null,
          scheduled_change_at: null,
          updated_at: now,
        })
        .eq("id", r.id);
      downgradesApplied++;
      if (r.provider_id) downgradedProviderIds.push(r.provider_id);
    }
    let staffCapsEnforced = await enforceStaffCapsForProviders(supabase, downgradedProviderIds);

    // 0b. End trials past trial_ends_at — charge if card on file, else lapse to free.
    const { data: expiredTrials } = await supabase
      .from("provider_subscriptions")
      .select("id, provider_id, plan_id, billing_period, paystack_authorization_code, trial_ends_at")
      .eq("status", "trialing")
      .not("trial_ends_at", "is", null)
      .lte("trial_ends_at", now);

    let trialsConverted = 0;
    let trialsLapsed = 0;
    for (const trial of expiredTrials ?? []) {
      const t = trial as {
        id: string;
        provider_id: string;
        plan_id: string;
        billing_period?: string | null;
        paystack_authorization_code?: string | null;
      };
      if (t.paystack_authorization_code) {
        await supabase
          .from("provider_subscriptions")
          .update({ status: "past_due", updated_at: now })
          .eq("id", t.id);
        trialsConverted++;
      } else {
        await supabase
          .from("provider_subscriptions")
          .update(
            expirePatch(),
          )
          .eq("id", t.id)
          .eq("status", "trialing");
        trialsLapsed++;
      }
    }

    // Resolve the free catalog plan — already loaded above as freePlanId / expirePatch.

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
    // A subscription enters past_due when a renewal payment fails. Paystack
    // gets a 3-day grace window (from updated_at, which is set when status
    // changes to past_due). Apple billing retry is up to 16 days — applying
    // this 3-day cut would revoke paid features while Apple is still retrying.
    const graceCutoff = new Date(Date.now() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: pastDueExpired, error: pastDueError } = await supabase
      .from("provider_subscriptions")
      .update(expirePatch())
      .eq("status", "past_due")
      .neq("billing_provider", "apple")
      .lt("updated_at", graceCutoff)
      .lt("expires_at", now)
      .select("id, provider_id");

    if (pastDueError) {
      console.error("Error expiring past-due subscriptions:", pastDueError);
    }

    const { data: applePastDueExpired, error: applePastDueError } = await supabase
      .from("provider_subscriptions")
      .update(expirePatch())
      .eq("status", "past_due")
      .eq("billing_provider", "apple")
      .not("apple_grace_period_expires_at", "is", null)
      .lt("apple_grace_period_expires_at", now)
      .lt("expires_at", now)
      .select("id, provider_id");

    if (applePastDueError) {
      console.error("Error expiring Apple past-due subscriptions past grace period:", applePastDueError);
    }

    const pastDueCount = (pastDueExpired?.length ?? 0) + (applePastDueExpired?.length ?? 0);
    if (pastDueCount > 0) {
      console.log(
        `Expired ${pastDueCount} past-due subscriptions past grace period:`,
        [...(pastDueExpired ?? []), ...(applePastDueExpired ?? [])].map((s) => s.id),
      );
    }

    // Notify affected providers about their expired subscriptions
    const allExpired = [
      ...(expired ?? []).map((s) => ({ ...s, reason: "cancelled_at_period_end" as const })),
      ...(naturalExpired ?? []).map((s) => ({ ...s, reason: "expired" as const })),
      ...(pastDueExpired ?? []).map((s) => ({ ...s, reason: "payment_failed" as const })),
      ...(applePastDueExpired ?? []).map((s) => ({ ...s, reason: "payment_failed" as const })),
    ];
    const lapsedTrialProviderIds = (expiredTrials ?? [])
      .filter((trial) => !(trial as { paystack_authorization_code?: string | null }).paystack_authorization_code)
      .map((trial) => (trial as { provider_id?: string }).provider_id);
    staffCapsEnforced += await enforceStaffCapsForProviders(supabase, [
      ...allExpired.map((s) => s.provider_id),
      ...lapsedTrialProviderIds,
    ]);

    let notified = 0;
    if (allExpired.length > 0) {
      const providerIds = [...new Set(allExpired.map((s) => s.provider_id))];
      const { data: providers } = await supabase
        .from("providers")
        .select("id, user_id, business_name, tenant_id")
        .in("id", providerIds);

      const providerMap = new Map(
        (providers ?? []).map((p: any) => [p.id, { userId: p.user_id, name: p.business_name, tenantId: p.tenant_id }])
      );

      for (const sub of allExpired) {
        const prov = providerMap.get(sub.provider_id);
        const churnReason =
          sub.reason === "payment_failed" ? "dunning_exhausted" : "cancelled_expired";
        void import("@/lib/integrations/slack/ops-triggers")
          .then(({ slackNotifySubscriptionChurned }) =>
            slackNotifySubscriptionChurned({
              tenantId: prov?.tenantId ?? null,
              subscriptionId: sub.id,
              providerId: sub.provider_id,
              providerName: prov?.name ?? null,
              reason: churnReason,
            }),
          )
          .catch(() => undefined);
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
      downgrades_applied: downgradesApplied,
      trials_to_past_due: trialsConverted,
      trials_lapsed: trialsLapsed,
      cancelled_expired: count,
      naturally_expired: naturalCount,
      past_due_expired: pastDueCount,
      providers_notified: notified,
      subscription_plans_repaired: subscriptionPlansRepaired,
      staff_caps_enforced: staffCapsEnforced,
    });
  } catch (error) {
    return handleApiError(error, "Cron: expire-cancelled-subscriptions failed");
  }
}
