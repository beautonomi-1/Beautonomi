import { notifyAdminOps } from "@/lib/notifications/notify-admin-ops";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";
import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";

export async function notifyBrandBriefAccepted(input: {
  tenantId: string;
  briefName: string;
  campaignId: string;
}) {
  const link = `/admin/brand/campaigns/${input.campaignId}`;
  await notifyAdminOps({
    roles: ["admin_marketing", "superadmin"],
    type: "admin_ops_alert",
    title: "Brand brief accepted",
    message: `${input.briefName} is now a campaign.`,
    link,
    tenantId: input.tenantId,
  });
  await tryNotifySlackEvent({
    tenantId: input.tenantId,
    environment: (process.env.NODE_ENV === "production"
      ? "production"
      : process.env.NODE_ENV === "development"
        ? "development"
        : "staging") as "production" | "staging" | "development",
    eventKey: SLACK_EVENT_KEYS.BRAND_BRIEF_ACCEPTED,
    dedupeKey: `brand:brief:accepted:${input.campaignId}`,
    entityType: "brand_campaign",
    entityId: input.campaignId,
    title: "Brand brief accepted",
    detailLines: [input.briefName],
    actionUrl: link,
  });
}

export async function notifyBrandCampaignLive(input: {
  tenantId: string;
  campaignName: string;
  campaignId: string;
}) {
  const link = `/admin/brand/campaigns/${input.campaignId}`;
  await notifyAdminOps({
    roles: ["admin_marketing", "superadmin"],
    type: "admin_ops_alert",
    title: "Brand campaign live",
    message: `${input.campaignName} is live.`,
    link,
    tenantId: input.tenantId,
  });
  await tryNotifySlackEvent({
    tenantId: input.tenantId,
    environment: (process.env.NODE_ENV === "production"
      ? "production"
      : process.env.NODE_ENV === "development"
        ? "development"
        : "staging") as "production" | "staging" | "development",
    eventKey: SLACK_EVENT_KEYS.BRAND_CAMPAIGN_LIVE,
    dedupeKey: `brand:campaign:live:${input.campaignId}`,
    entityType: "brand_campaign",
    entityId: input.campaignId,
    title: "Brand campaign live",
    detailLines: [input.campaignName],
    actionUrl: link,
  });
}
