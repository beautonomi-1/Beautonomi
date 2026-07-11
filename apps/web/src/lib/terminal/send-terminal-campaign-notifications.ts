import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchTemplateNotification, withTenantVariable } from "@/lib/notifications/dispatch-template-notification";
import { insertNotification } from "@/lib/notifications/insert-notification";

type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  message_body: string | null;
  cta_label: string | null;
  cta_url: string | null;
  announcement_type?: string | null;
  media_url?: string | null;
  expires_at?: string | null;
};

type RecipientRow = {
  id: string;
  provider_id: string;
  user_id: string;
  providers?: { business_name?: string | null } | null;
};

/** Deep link the provider app resolves for announcement rows and push taps. */
const ANNOUNCEMENTS_DEEP_LINK = "/(app)/announcements";

export async function sendTerminalCampaignNotifications(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  recipients: RecipientRow[],
): Promise<{ sent: number; skipped_opt_out: number }> {
  if (recipients.length === 0) {
    return { sent: 0, skipped_opt_out: 0 };
  }

  const providerIds = recipients.map((r) => r.provider_id);
  const { data: optOutRows } = await (supabase.from("terminal_campaign_recipients") as any)
    .select("provider_id")
    .in("provider_id", providerIds)
    .not("opted_out_at", "is", null);

  const optedOut = new Set((optOutRows ?? []).map((r: { provider_id: string }) => r.provider_id));
  const eligible = recipients.filter((r) => !optedOut.has(r.provider_id));
  const skipped_opt_out = recipients.length - eligible.length;

  if (eligible.length === 0) {
    return { sent: 0, skipped_opt_out };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const ctaUrl = campaign.cta_url || `${appUrl}/provider/settings/sales/terminal-shop`;
  const ctaLabel = campaign.cta_label ?? "View terminals";
  const announcementType = campaign.announcement_type || "promotion";

  // Rich announcement payload — same shape the admin broadcast push route
  // writes, so the provider Announcements screen renders media/CTA/expiry
  // and deep-link routing works identically.
  const announcementData: Record<string, unknown> = {
    type: "admin_broadcast",
    source: "terminal_campaign",
    campaign_id: campaign.id,
    announcement_type: announcementType,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    url: ANNOUNCEMENTS_DEEP_LINK,
    deep_link: ANNOUNCEMENTS_DEEP_LINK,
    ...(campaign.media_url ? { media_url: campaign.media_url, media_type: "image" } : {}),
    ...(campaign.expires_at ? { expires_at: campaign.expires_at } : {}),
  };

  let sent = 0;

  for (const recipient of eligible) {
    const vars = withTenantVariable(campaign.tenant_id, {
      business_name: recipient.providers?.business_name ?? "Provider",
      headline: campaign.name,
      body: campaign.message_body ?? "",
      cta_label: ctaLabel,
      cta_url: ctaUrl,
      app_url: appUrl,
    });

    // skipInApp: the auto bell row would be typed `terminal_upsell_announcement`,
    // which the notifications enum downgrades to `system` and the provider
    // Announcements screen (filter: admin_broadcast) never shows. We insert our
    // own `admin_broadcast` row below so the campaign lands in the announcement
    // inbox + banner with the full rich payload.
    const result = await dispatchTemplateNotification(
      "terminal_upsell_announcement",
      [recipient.user_id],
      vars,
      ["push", "email"],
      { appType: "provider", skipInApp: true },
    );

    if (result.success) {
      sent += 1;
      await insertNotification({
        user_id: recipient.user_id,
        type: "admin_broadcast",
        title: campaign.name,
        message: campaign.message_body ?? "",
        data: announcementData,
        link: ANNOUNCEMENTS_DEEP_LINK,
      });
      await (supabase.from("terminal_campaign_recipients") as any)
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", recipient.id);
    }
  }

  return { sent, skipped_opt_out };
}
