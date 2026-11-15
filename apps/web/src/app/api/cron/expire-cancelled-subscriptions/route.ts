/**
 * GET /api/cron/expire-cancelled-subscriptions
 *
 * Transitions provider subscriptions through their lifecycle:
 * 1. cancelled_at IS NOT NULL + status='active' + expires_at passed → status='expired' (cancel-at-period-end)
 * 2. auto_renew=false + status='active' + expires_at passed + not cancelled → status='expired'
 * 3. status='past_due' + past 3-day grace + expires_at passed → status='expired'
 *    Paystack and Flutterwave keep past_due until their day-1/3/5 card retries
 *    finish (or the collection window ends). Paid access still stops at 3 days.
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
import {
  clearAppleMerchantOnFree,
  stopPaystackSubscriptionBeforeClear,
} from "@/lib/subscriptions/provider-billing-merchant";
import { enforceStaffCapForProviderPlan } from "@/lib/provider/enforce-staff-cap-after-downgrade";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { applyScheduledProviderSubscriptionDowngrades } from "@/lib/subscriptions/apply-scheduled-provider-subscription-downgrades";
import {
  DUNNING_MAX_RETRIES,
  dunningCollectionWindowDays,
} from "@/lib/subscriptions/dunning-retry";

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
      past_due_since: null,
      next_payment_date: null,
      ...(freePlanId ? { plan_id: freePlanId } : {}),
      ...clearAppleMerchantOnFree(),
      ...(extra ?? {}),
    });

    // 0a. Apply scheduled paid-to-paid downgrades at period end (no proration).
    const scheduledDowngradeResult = await applyScheduledProviderSubscriptionDowngrades(
      supabase,
      now,
      expirePatch,
    );
    let downgradesApplied = scheduledDowngradeResult.downgradesApplied;
    const downgradedProviderIds = scheduledDowngradeResult.downgradedProviderIds;
    const failedScheduledDowngrades = scheduledDowngradeResult.expiredFromFailed;
    let staffCapsEnforced = await enforceStaffCapsForProviders(supabase, downgradedProviderIds);

    // 0b. End trials past trial_ends_at — charge if card on file, else lapse to free.
    const { data: expiredTrials } = await supabase
      .from("provider_subscriptions")
      .select(
        "id, provider_id, plan_id, billing_period, billing_provider, expires_at, paystack_authorization_code, stripe_customer_id, stripe_payment_method_id, trial_ends_at",
      )
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
        expires_at?: string | null;
        paystack_authorization_code?: string | null;
        stripe_customer_id?: string | null;
        stripe_payment_method_id?: string | null;
        billing_provider?: string | null;
      };
      if (t.billing_provider === "apple") continue;
      const stripeReady =
        t.billing_provider === "stripe" &&
        Boolean(t.stripe_payment_method_id?.trim()) &&
        Boolean(t.stripe_customer_id?.trim());
      if (stripeReady) {
        // Stripe renewal charges an active plan and skips a row with no customer.
        const expiresAtMs = t.expires_at ? Date.parse(t.expires_at) : Number.NaN;
        const periodStillOpen = Number.isFinite(expiresAtMs) && expiresAtMs > Date.parse(now);
        await supabase
          .from("provider_subscriptions")
          .update({
            status: "active",
            auto_renew: true,
            ...(periodStillOpen ? {} : { expires_at: now }),
            updated_at: now,
          })
          .eq("id", t.id)
          .eq("billing_provider", "stripe")
          .eq("status", "trialing");
        trialsConverted++;
      } else if (t.paystack_authorization_code && t.billing_provider !== "stripe") {
        await supabase
          .from("provider_subscriptions")
          .update({ status: "past_due", past_due_since: now, updated_at: now })
          .eq("id", t.id)
          .neq("billing_provider", "apple")
          .neq("billing_provider", "stripe")
          .eq("status", "trialing");
        trialsConverted++;
      } else {
        await supabase
          .from("provider_subscriptions")
          .update(
            expirePatch(),
          )
          .eq("id", t.id)
          .neq("billing_provider", "apple")
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
    // A subscription enters past_due when a renewal payment fails. Card billing
    // gets a 3-day grace window from past_due_since, the first failed charge.
    // updated_at cannot be that clock: a trigger rewrites it on every save,
    // including dunning retries. Apple billing retry is up to 16 days.
    // Paystack and Flutterwave still charge on days 1, 3, and 5 after each
    // attempt, so a saved card stays past_due until those retries finish.
    // Paid access already ended at day 3. Stripe and manual have no retry.
    const graceCutoff = new Date(Date.now() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const collectionCutoff = new Date(
      Date.now() - dunningCollectionWindowDays() * 24 * 60 * 60 * 1000,
    ).toISOString();
    const retriesFinishedOrNoCard = `billing_provider.eq.stripe,billing_provider.eq.manual,paystack_authorization_code.is.null,dunning_retry_count.gte.${DUNNING_MAX_RETRIES}`;

    const pastDueQuery = () =>
      supabase
        .from("provider_subscriptions")
        .update(expirePatch())
        .eq("status", "past_due")
        .neq("billing_provider", "apple")
        .lt("expires_at", now)
        .select("id, provider_id");

    const { data: pastDueExpired, error: pastDueError } = await pastDueQuery()
      .lt("past_due_since", graceCutoff)
      .or(retriesFinishedOrNoCard);
    const { data: unanchoredPastDue, error: unanchoredError } = await pastDueQuery()
      .is("past_due_since", null)
      .lt("updated_at", graceCutoff)
      .or(retriesFinishedOrNoCard);
    const { data: collectionWindowExpired, error: collectionWindowError } = await pastDueQuery()
      .lt("past_due_since", collectionCutoff)
      .lt("dunning_retry_count", DUNNING_MAX_RETRIES)
      .not("paystack_authorization_code", "is", null)
      .neq("billing_provider", "stripe")
      .neq("billing_provider", "manual");
    const { data: unanchoredCollectionExpired, error: unanchoredCollectionError } =
      await pastDueQuery()
        .is("past_due_since", null)
        .lt("updated_at", collectionCutoff)
        .lt("dunning_retry_count", DUNNING_MAX_RETRIES)
        .not("paystack_authorization_code", "is", null)
        .neq("billing_provider", "stripe")
        .neq("billing_provider", "manual");

    if (pastDueError) {
      console.error("Error expiring past-due subscriptions:", pastDueError);
    }
    if (unanchoredError) {
      console.error("Error expiring past-due subscriptions without a grace start:", unanchoredError);
    }
    if (collectionWindowError) {
      console.error("Error expiring past-due subscriptions after card retries:", collectionWindowError);
    }
    if (unanchoredCollectionError) {
      console.error(
        "Error expiring past-due subscriptions after card retries without a grace start:",
        unanchoredCollectionError,
      );
    }
    const cardPastDueExpired = [
      ...(pastDueExpired ?? []),
      ...(unanchoredPastDue ?? []),
      ...(collectionWindowExpired ?? []),
      ...(unanchoredCollectionExpired ?? []),
    ];

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

    const pastDueCount = cardPastDueExpired.length + (applePastDueExpired?.length ?? 0);
    if (pastDueCount > 0) {
      console.log(
        `Expired ${pastDueCount} past-due subscriptions past grace period:`,
        [...cardPastDueExpired, ...(applePastDueExpired ?? [])].map((s) => s.id),
      );
    }

    // A page view can mark the row expired before this job runs. Finish the lapse
    // onto the free plan when that row is still on the paid plan.
    let alreadyExpiredStillPaid: { id: string; provider_id: string }[] = [];
    if (freePlanId) {
      const { data: finished, error: finishedError } = await supabase
        .from("provider_subscriptions")
        .update(expirePatch())
        .eq("status", "expired")
        .neq("plan_id", freePlanId)
        .lt("expires_at", now)
        .or("auto_renew.eq.false,cancelled_at.not.is.null")
        .select("id, provider_id");
      if (finishedError) {
        console.error("Error finishing expired subscriptions still on a paid plan:", finishedError);
      } else {
        alreadyExpiredStillPaid = (finished ?? []) as { id: string; provider_id: string }[];
      }
    }

    const codeSelect = "id, paystack_subscription_code, tenant_id, provider_id";
    const [codedExpired, codedFree, codedApple, codedStopNote] = await Promise.all([
      supabase
        .from("provider_subscriptions")
        .select(codeSelect)
        .eq("status", "expired")
        .not("paystack_subscription_code", "is", null),
      freePlanId
        ? supabase
            .from("provider_subscriptions")
            .select(codeSelect)
            .eq("plan_id", freePlanId)
            .neq("status", "past_due")
            .not("paystack_subscription_code", "is", null)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("provider_subscriptions")
        .select(codeSelect)
        .eq("billing_provider", "apple")
        .not("paystack_subscription_code", "is", null),
      supabase
        .from("provider_subscriptions")
        .select(codeSelect)
        .like("paystack_sync_note", "We could not stop automatic billing%")
        .neq("status", "past_due")
        .not("paystack_subscription_code", "is", null),
    ]);
    const codedExpiredError =
      codedExpired.error ||
      codedFree.error ||
      codedApple.error ||
      codedStopNote.error;
    if (codedExpiredError) {
      console.error("Error loading Paystack subscriptions to stop:", codedExpiredError);
    } else {
      const seen = new Set<string>();
      const codedRows = [
        ...(codedExpired.data ?? []),
        ...(codedFree.data ?? []),
        ...(codedApple.data ?? []),
        ...(codedStopNote.data ?? []),
      ].filter((row) => {
        const id = String((row as { id?: string }).id ?? "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      for (const row of codedRows as Array<{
        id: string;
        paystack_subscription_code?: string | null;
        tenant_id?: string | null;
        provider_id?: string | null;
      }>) {
        const code = String(row.paystack_subscription_code ?? "").trim();
        const stopped = await stopPaystackSubscriptionBeforeClear({
          supabase,
          code,
          tenantId: row.tenant_id,
          providerId: row.provider_id,
        });
        if (stopped === "cleared") {
          await supabase
            .from("provider_subscriptions")
            .update({
              paystack_subscription_code: null,
              paystack_sync_pending: false,
              paystack_sync_note: null,
            })
            .eq("id", row.id)
            .eq("paystack_subscription_code", code);
        } else if (stopped === "kept") {
          await supabase
            .from("provider_subscriptions")
            .update({
              paystack_sync_note:
                "We could not stop automatic billing. Contact support if charges continue.",
            })
            .eq("id", row.id)
            .eq("paystack_subscription_code", code);
        }
      }
    }

    // Notify affected providers about their expired subscriptions
    const allExpired = [
      ...failedScheduledDowngrades.map((s) => ({ ...s, reason: "payment_failed" as const })),
      ...(expired ?? []).map((s) => ({ ...s, reason: "cancelled_at_period_end" as const })),
      ...(naturalExpired ?? []).map((s) => ({ ...s, reason: "expired" as const })),
      ...(cardPastDueExpired).map((s) => ({ ...s, reason: "payment_failed" as const })),
      ...(applePastDueExpired ?? []).map((s) => ({ ...s, reason: "payment_failed" as const })),
    ];
    const lapsedTrialProviderIds = (expiredTrials ?? [])
      .filter((trial) => !(trial as { paystack_authorization_code?: string | null }).paystack_authorization_code)
      .map((trial) => (trial as { provider_id?: string }).provider_id);
    staffCapsEnforced += await enforceStaffCapsForProviders(supabase, [
      ...allExpired.map((s) => s.provider_id),
      ...alreadyExpiredStillPaid.map((s) => s.provider_id),
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
        if (prov?.tenantId && sub.provider_id) {
          void import("@/lib/provider-ops/ops-case")
            .then(({ markCaseChurned }) =>
              markCaseChurned(
                supabase,
                prov.tenantId as string,
                sub.provider_id as string,
                sub.reason === "payment_failed" ? "dunning_exhausted" : "cancelled_expired",
              ),
            )
            .catch(() => undefined);
        }
        if (!prov?.userId) continue;

        try {
          const reasonMsg = sub.reason === "cancelled_at_period_end"
            ? "Your subscription has been cancelled as the billing period ended."
            : sub.reason === "payment_failed"
              ? "Your subscription has expired due to unsuccessful payment renewal."
              : "Your subscription has expired. Renew to restore your premium features.";

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
              app_url: process.env.NEXT_PUBLIC_APP_URL ?? "",
              notice: reasonMsg,
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

    try {
      const { reconcileRetentionForAllTenants } = await import(
        "@/lib/provider-ops/reconcile-retention-at-risk"
      );
      await reconcileRetentionForAllTenants(supabase);
    } catch (reconcileErr) {
      console.error("[expire-cancelled-subscriptions] retention reconcile failed:", reconcileErr);
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
