import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchTemplateNotification, withTenantVariable } from "@/lib/notifications/dispatch-template-notification";

type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  message_body: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

type RecipientRow = {
  id: string;
  provider_id: string;
  user_id: string;
  providers?: { business_name?: string | null } | null;
};

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
  let sent = 0;

  for (const recipient of eligible) {
    const vars = withTenantVariable(campaign.tenant_id, {
      business_name: recipient.providers?.business_name ?? "Provider",
      headline: campaign.name,
      body: campaign.message_body ?? "",
      cta_label: campaign.cta_label ?? "View terminals",
      cta_url: ctaUrl,
      app_url: appUrl,
    });

    const result = await dispatchTemplateNotification(
      "terminal_upsell_announcement",
      [recipient.user_id],
      vars,
      ["push", "email"],
      { appType: "provider" },
    );

    if (result.success) {
      sent += 1;
      await (supabase.from("terminal_campaign_recipients") as any)
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", recipient.id);
    }
  }

  return { sent, skipped_opt_out };
}
