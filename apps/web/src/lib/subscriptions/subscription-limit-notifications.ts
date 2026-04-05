/**
 * Notify provider owners when subscription usage is high (≥80%) or at the monthly cap.
 * Dedup per provider × feature × calendar month × level (warning | reached) via notifications.data.dedup_key.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";

interface UsageSummaryRow {
  feature_type: string;
  current_usage: number;
  limit_value: number | null;
  percentage_used: number | string | null;
  is_unlimited: boolean;
  can_use: boolean;
  warning_threshold: boolean;
}

function calendarPeriodKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function featureLabel(featureType: string): string {
  switch (featureType) {
    case "bookings":
      return "monthly online bookings";
    case "messages":
      return "monthly client chat messages";
    case "staff":
      return "team members";
    case "locations":
      return "locations";
    default:
      return featureType;
  }
}

async function dedupAlreadySent(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  dedupKey: string
): Promise<boolean> {
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .contains("data", { dedup_key: dedupKey })
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * After bookings, messages, staff, or location changes, re-check usage and notify the provider owner once per threshold per month.
 */
export async function maybeNotifyProviderSubscriptionLimits(providerId: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin();

    const { data: provider, error: pErr } = await admin
      .from("providers")
      .select("user_id")
      .eq("id", providerId)
      .maybeSingle();

    if (pErr || !provider?.user_id) return;

    const ownerUserId = provider.user_id as string;

    const { data: summary, error: sErr } = await admin.rpc("get_provider_usage_summary", {
      provider_id_param: providerId,
    });

    if (sErr || !Array.isArray(summary) || summary.length === 0) return;

    const { data: planRows } = await admin.rpc("get_provider_subscription_plan", {
      provider_id_param: providerId,
    });
    const planName =
      (Array.isArray(planRows) && planRows[0] && (planRows[0] as { plan_name?: string }).plan_name) ||
      "Your plan";

    const periodKey = calendarPeriodKey();
    const adminClient = admin;

    for (const raw of summary as UsageSummaryRow[]) {
      const limitValue = raw.limit_value;
      if (limitValue == null) continue;

      const current = Number(raw.current_usage ?? 0);
      const pct = Math.round(Number(raw.percentage_used ?? 0));

      let level: "reached" | "warning" | null = null;
      if (!raw.can_use || current >= limitValue) {
        level = "reached";
      } else if (raw.warning_threshold && raw.can_use) {
        level = "warning";
      }
      if (!level) continue;

      const dedupKey = `${raw.feature_type}:${periodKey}:${level}`;
      if (await dedupAlreadySent(adminClient, ownerUserId, dedupKey)) continue;

      const label = featureLabel(raw.feature_type);
      const appUrl =
        (typeof process.env.NEXT_PUBLIC_APP_URL === "string"
          ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
          : "") || "";

      const vars: Record<string, string> = {
        plan_name: String(planName),
        feature_label: label,
        current_usage: String(current),
        limit_value: String(limitValue),
        percent_used: String(pct),
        upgrade_cta: "Upgrade your plan in the app to unlock higher limits.",
        app_url: appUrl,
      };

      const templateKey =
        level === "reached"
          ? "provider_subscription_limit_reached"
          : "provider_subscription_limit_warning";

      const title =
        level === "reached"
          ? `Plan limit reached: ${label}`
          : `Approaching plan limit: ${label}`;

      const message =
        level === "reached"
          ? `You've reached ${current}/${limitValue} on your ${planName} for ${label} this month. Upgrade to continue growing.`
          : `You're at ${pct}% (${current}/${limitValue}) of your ${planName} limit for ${label} this month. Upgrade before you hit the cap.`;

      try {
        await sendTemplateNotification(templateKey, [ownerUserId], vars, ["push", "email"], {
          appType: "provider",
          supabaseClient: adminClient,
        });
      } catch (sendErr) {
        console.warn("[subscription-limit-notifications] template send failed:", sendErr);
      }

      try {
        await adminClient.from("notifications").insert({
          user_id: ownerUserId,
          type: "system",
          title,
          message,
          data: {
            dedup_key: dedupKey,
            subscription_limit: true,
            feature_type: raw.feature_type,
            level,
          },
          action_url: "/provider/subscription",
          is_read: false,
        });
      } catch (insertErr) {
        console.warn("[subscription-limit-notifications] in-app insert failed:", insertErr);
      }
    }
  } catch (e) {
    console.warn("[maybeNotifyProviderSubscriptionLimits]", e);
  }
}
