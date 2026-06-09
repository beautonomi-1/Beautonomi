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

const REMINDER_DAYS = [30, 14, 7, 3, 1] as const;

export async function GET(request: NextRequest) {
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
        plan:subscription_plans(name)
      `)
      .in("status", ["active", "past_due"])
      .not("expires_at", "is", null)
      .lte("expires_at", thirtyDaysOut)
      .gte("expires_at", now.toISOString());

    if (subErr) {
      console.error("subscription-reminders: query error", subErr);
      throw subErr;
    }

    if (!subscriptions?.length) {
      return successResponse({ message: "No expiring subscriptions", sent: 0 });
    }

    // Get provider owner user IDs for notifications
    const providerIds = [...new Set(subscriptions.map((s) => s.provider_id))];
    const { data: providerUsers } = await supabase
      .from("providers")
      .select("id, user_id, business_name")
      .in("id", providerIds);

    const providerMap = new Map(
      (providerUsers ?? []).map((p: any) => [p.id, { userId: p.user_id, name: p.business_name }])
    );

    for (const sub of subscriptions) {
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
          title: `Subscription expiring in ${matchedThreshold} day${matchedThreshold > 1 ? "s" : ""}`,
          message: `Your ${planName} subscription expires on ${expiryStr}. Renew to keep your features active.`,
          data: {
            reminder_key: reminderKey,
            subscription_id: sub.id,
            days_until_expiry: matchedThreshold,
          },
          action_url: "/settings/subscription",
        });

        await sendTemplateNotification(
          "subscription_expiring",
          [provider.userId],
          {
            plan_name: planName,
            expiry_date: expiryStr,
            days_remaining: matchedThreshold.toString(),
            business_name: provider.name || "",
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

    return successResponse({
      message: `Subscription reminders sent`,
      sent,
      checked: subscriptions.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return handleApiError(error, "Cron: subscription-reminders failed");
  }
}
