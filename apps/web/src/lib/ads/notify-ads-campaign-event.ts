import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";

export type AdsCampaignNotifyEvent =
  | "budget_exhausted"
  | "campaign_ended"
  | "paused_by_admin"
  | "budget_low"
  | "approved"
  | "rejected";

async function resolveProviderUserId(
  supabase: SupabaseClient,
  providerId: string,
): Promise<{ userId: string | null; businessName: string }> {
  const { data } = await supabase
    .from("providers")
    .select("user_id, business_name")
    .eq("id", providerId)
    .maybeSingle();
  const row = data as { user_id?: string | null; business_name?: string | null } | null;
  return {
    userId: row?.user_id ?? null,
    businessName: row?.business_name ?? "",
  };
}

const TEMPLATE_BY_EVENT: Record<AdsCampaignNotifyEvent, string> = {
  budget_exhausted: "ads_budget_exhausted",
  campaign_ended: "ads_campaign_ended",
  paused_by_admin: "ads_campaign_paused_by_admin",
  budget_low: "ads_budget_low",
  approved: "ads_campaign_approved",
  rejected: "ads_campaign_rejected",
};

export async function notifyAdsCampaignEvent(params: {
  supabase: SupabaseClient;
  providerId: string;
  campaignId: string;
  event: AdsCampaignNotifyEvent;
  reason?: string | null;
  percentUsed?: number;
}): Promise<void> {
  const { supabase, providerId, campaignId, event, reason, percentUsed } = params;
  const { userId, businessName } = await resolveProviderUserId(supabase, providerId);
  if (!userId) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(/\/$/, "");
  const templateKey = TEMPLATE_BY_EVENT[event];

  try {
    await sendTemplateNotification(
      templateKey,
      [userId],
      {
        business_name: businessName,
        campaign_id: campaignId,
        reason: reason ?? "",
        percent_used: percentUsed != null ? String(Math.round(percentUsed)) : "",
        app_url: appUrl,
      },
      event === "budget_low" ? ["push"] : ["push", "email"],
      { appType: "provider" },
    );
  } catch (err) {
    console.warn(`[ads_notify] ${templateKey} failed:`, err);
  }
}
