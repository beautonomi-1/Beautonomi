/**
 * GET /api/cron/subscription-reminders
 *
 * Sends reminder notifications to providers whose subscriptions are expiring soon.
 * Checks at 30, 14, 7, 3, and 1 day thresholds, with dedup via notification metadata.
 * Runs daily via Vercel cron.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { stalePendingUpgradePatch } from "@/lib/subscriptions/pending-upgrade-fields";

const REMINDER_DAYS = [30, 14, 7, 3, 1] as const;
const JOB_NAME = "subscription-reminders";
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
    const now = new Date();
    let sent = 0;
    const errors: string[] = [];

    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: subscriptions, error: subErr } = await supabase
      .from("provider_subscriptions")
      .select(`
        id,
        provider_id,
        expires_at,
        status,
        plan:subscription_plans!plan_id(name)
      `)
      .eq("status", "active")
      .or("auto_renew.eq.false,cancelled_at.not.is.null")
      .not("expires_at", "is", null)
      .lte("expires_at", thirtyDaysOut)
      .gte("expires_at", now.toISOString());

    if (subErr) {
      console.error("subscription-reminders: query error", subErr);
      throw subErr;
    }

    const expiring = subscriptions ?? [];
    const providerMap = new Map<string, { userId: string; name?: string }>();
    async function providerFor(providerId: string) {
      const cached = providerMap.get(providerId);
      if (cached?.userId) return cached;
      const { data: pRow } = await supabase
        .from("providers")
        .select("id, user_id, business_name")
        .eq("id", providerId)
        .maybeSingle();
      if (!pRow) return undefined;
      const resolved = {
        userId: (pRow as { user_id: string }).user_id,
        name: (pRow as { business_name?: string }).business_name,
      };
      if (resolved.userId) providerMap.set(providerId, resolved);
      return resolved.userId ? resolved : undefined;
    }
    if (expiring.length > 0) {
      const providerIds = [...new Set(expiring.map((s) => s.provider_id))];
      const { data: providerUsers } = await supabase
        .from("providers")
        .select("id, user_id, business_name")
        .in("id", providerIds);
      for (const p of providerUsers ?? []) {
        const row = p as { id: string; user_id: string; business_name?: string };
        if (row.user_id) providerMap.set(row.id, { userId: row.user_id, name: row.business_name });
      }
    }

    for (const sub of expiring) {
      const expiresAt = new Date(sub.expires_at!);
      const daysUntil = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const matchedThreshold = REMINDER_DAYS.find((d) => daysUntil <= d && daysUntil > (REMINDER_DAYS[REMINDER_DAYS.indexOf(d) + 1] ?? 0));
      if (!matchedThreshold) continue;

      const provider = providerMap.get(sub.provider_id);
      if (!provider?.userId) continue;

      const reminderKey = `sub_expiry_${sub.id}_${matchedThreshold}d`;

      // Dedup: check if we already sent this specific reminder
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", provider.userId)
        .contains("data", { reminder_key: reminderKey })
        .limit(1);

      if (existing && existing.length > 0) continue;

      const planName = (sub.plan as any)?.name || "your plan";
      const expiryStr = expiresAt.toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      try {
        await insertNotification({
          user_id: provider.userId,
          type: "system",
          title: `Subscription expiring in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
          message: `Your ${planName} subscription expires on ${expiryStr}. Renew to keep your features active.`,
          data: {
            reminder_key: reminderKey,
            subscription_id: sub.id,
            days_until_expiry: daysUntil,
          },
          action_url: "/settings/subscription",
        });

        await sendTemplateNotification(
          "subscription_expiring",
          [provider.userId],
          {
            plan_name: planName,
            expires_at: expiryStr,
            days_until: String(daysUntil),
            business_name: provider.name || "",
            app_url: process.env.NEXT_PUBLIC_APP_URL ?? "",
          },
          ["push"],
          // In-app bell row inserted manually above; skip template auto-insert.
          { appType: "provider", skipInApp: true }
        );

        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${sub.id}: ${msg}`);
      }
    }

    // Trial ending reminders. A missed day-3 run still sends while 2 days remain.
    const trialHorizon = new Date(now.getTime() + 3 * 86400000).toISOString();
    const { data: trialing } = await supabase
      .from("provider_subscriptions")
      .select(
        "id, provider_id, trial_ends_at, expires_at, billing_provider, paystack_authorization_code, stripe_customer_id, stripe_payment_method_id, plan:subscription_plans!plan_id(name)",
      )
      .eq("status", "trialing")
      .not("trial_ends_at", "is", null)
      .lte("trial_ends_at", trialHorizon)
      .gte("trial_ends_at", now.toISOString());

    for (const sub of trialing ?? []) {
      const endsAt = new Date((sub as { trial_ends_at: string }).trial_ends_at);
      const daysUntil = Math.ceil((endsAt.getTime() - now.getTime()) / 86400000);
      const matched = daysUntil <= 1 ? 1 : daysUntil <= 3 ? 3 : null;
      if (!matched) continue;
      const provider = await providerFor((sub as { provider_id: string }).provider_id);
      if (!provider?.userId) continue;
      const reminderKey = `sub_trial_${(sub as { id: string }).id}_${matched}d`;
      const { data: existingTrial } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", provider.userId)
        .contains("data", { reminder_key: reminderKey })
        .maybeSingle();
      if (existingTrial) continue;
      const planName =
        (sub as { plan?: { name?: string } | Array<{ name?: string }> }).plan &&
        (Array.isArray((sub as { plan?: unknown }).plan)
          ? (sub as { plan: Array<{ name?: string }> }).plan[0]?.name
          : (sub as { plan: { name?: string } }).plan?.name) ||
        "your plan";
      const trialRow = sub as {
        billing_provider?: string | null;
        expires_at?: string | null;
        paystack_authorization_code?: string | null;
        stripe_customer_id?: string | null;
        stripe_payment_method_id?: string | null;
      };
      const trialBilling = String(trialRow.billing_provider ?? "paystack").toLowerCase();
      const cardWillBeCharged =
        (Boolean(trialRow.paystack_authorization_code?.trim()) &&
          (trialBilling === "paystack" ||
            trialBilling === "manual" ||
            trialBilling === "flutterwave")) ||
        (trialRow.billing_provider === "stripe" &&
          Boolean(trialRow.stripe_payment_method_id?.trim()) &&
          Boolean(trialRow.stripe_customer_id?.trim()));
      try {
        if (cardWillBeCharged) {
          await insertNotification({
            user_id: provider.userId,
            type: "system",
            title: `Trial ending in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
            message: `Your free trial of ${planName} ends on ${endsAt.toLocaleDateString()}. ${
              trialRow.billing_provider === "stripe" &&
              trialRow.expires_at &&
              new Date(trialRow.expires_at).getTime() > endsAt.getTime()
                ? `The card on file will be charged on ${new Date(trialRow.expires_at).toLocaleDateString()}.`
                : "The card on file will be charged when the trial ends."
            }`,
            data: { reminder_key: reminderKey, subscription_id: (sub as { id: string }).id },
            action_url: "/settings/subscription",
          });
        } else {
          await sendTemplateNotification(
            "subscription_trial_ending",
            [provider.userId],
            {
              business_name: provider.name || "",
              days_until: String(daysUntil),
              trial_ends_at: endsAt.toLocaleDateString(),
              plan_name: planName,
              app_url: process.env.NEXT_PUBLIC_APP_URL ?? "",
            },
            ["push", "email"],
            { appType: "provider" },
          );
        }
        sent++;
      } catch (err) {
        errors.push(`trial ${(sub as { id: string }).id}: ${String(err)}`);
      }
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const { data: stalePending } = await supabase
      .from("provider_subscriptions")
      .select("id, provider_id, status, pending_upgrade_set_at")
      .not("pending_upgrade_plan_id", "is", null)
      .lt("pending_upgrade_set_at", thirtyDaysAgo);

    for (const row of stalePending ?? []) {
      const stale = row as { id: string; status?: string | null };
      await supabase
        .from("provider_subscriptions")
        .update(stalePendingUpgradePatch({ status: stale.status, now }))
        .eq("id", stale.id);
    }

    const { data: pendingUpgrades } = await supabase
      .from("provider_subscriptions")
      .select(
        "id, provider_id, pending_upgrade_set_at, pending_upgrade_plan_id, plan:subscription_plans!pending_upgrade_plan_id(name)",
      )
      .not("pending_upgrade_plan_id", "is", null);

    for (const row of pendingUpgrades ?? []) {
      const setAt = (row as { pending_upgrade_set_at?: string | null }).pending_upgrade_set_at;
      if (!setAt) continue;
      const ageMs = now.getTime() - new Date(setAt).getTime();
      const bucket =
        ageMs >= 7 * 86400000 && ageMs < 8 * 86400000
          ? "7d"
          : ageMs >= 86400000 && ageMs < 2 * 86400000
            ? "24h"
            : null;
      if (!bucket) continue;
      const provider = await providerFor((row as { provider_id: string }).provider_id);
      if (!provider?.userId) continue;
      const reminderKey = `pending_upgrade_${(row as { id: string }).id}_${bucket}`;
      const { data: existingPending } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", provider.userId)
        .contains("data", { reminder_key: reminderKey })
        .maybeSingle();
      if (existingPending) continue;
      const planName =
        (row as { plan?: { name?: string } | null }).plan?.name ?? "your selected plan";
      try {
        await insertNotification({
          user_id: provider.userId,
          type: "system",
          title: "Finish your subscription upgrade",
          message: `Complete checkout to activate ${planName}.`,
          data: { reminder_key: reminderKey, subscription_id: (row as { id: string }).id },
          action_url: "/settings/subscription",
        });
        sent++;
      } catch (err) {
        errors.push(`pending ${(row as { id: string }).id}: ${String(err)}`);
      }
    }

    return successResponse({
      message: `Subscription reminders sent`,
      sent,
      checked: expiring.length,
      pending_upgrade_nudges: pendingUpgrades?.length ?? 0,
      stale_pending_cleared: stalePending?.length ?? 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return handleApiError(error, "Cron: subscription-reminders failed");
  }
}
