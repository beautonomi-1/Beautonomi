import type { SupabaseClient } from "@supabase/supabase-js";
import { lineTypeForChannelKey } from "./channels";
import type { CampaignTypeKey } from "./brief-schema";

const DEFAULT_CHECKLIST: Array<{ stage: string; label: string; template_key: string }> = [
  { stage: "creative", label: "Claims substantiated", template_key: "claims" },
  { stage: "creative", label: "T&Cs linked where required", template_key: "terms" },
  { stage: "creative", label: "POPIA opt-in checked for CRM", template_key: "popia" },
  { stage: "creative", label: "Influencer #ad disclosure", template_key: "influencer_ad" },
  { stage: "creative", label: "Usage rights and expiry recorded", template_key: "rights" },
  { stage: "creative", label: "Tracking links tested", template_key: "links" },
];

const TYPE_CHECKLIST: Partial<Record<CampaignTypeKey, string[]>> = {
  influencer: ["influencer_ad", "rights"],
  seasonal_offer: ["terms", "claims"],
  crm_lifecycle: ["popia"],
};

export async function spawnFromAcceptedBrief(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    briefId: string;
    campaignId: string;
    campaignType: string;
    channels: string[];
    deliverables: Array<{ title?: string; channel?: string; due_at?: string; owner_id?: string }>;
    actorId: string;
  },
): Promise<void> {
  const typeKey = input.campaignType as CampaignTypeKey;
  const extraKeys = TYPE_CHECKLIST[typeKey] ?? [];
  const checklist = DEFAULT_CHECKLIST.filter(
    (c) => extraKeys.length === 0 || extraKeys.includes(c.template_key) || c.template_key === "links",
  );

  if (checklist.length) {
    await supabase.from("brand_checklist_instances").insert(
      checklist.map((c) => ({
        tenant_id: input.tenantId,
        campaign_id: input.campaignId,
        template_key: c.template_key,
        stage: c.stage,
        label: c.label,
      })),
    );
  }

  for (const d of input.deliverables) {
    if (!d.title) continue;
    await supabase.from("brand_tasks").insert({
      tenant_id: input.tenantId,
      campaign_id: input.campaignId,
      brief_id: input.briefId,
      title: d.title,
      owner_id: d.owner_id ?? input.actorId,
      due_at: d.due_at ?? null,
      meta: { channel: d.channel ?? null },
    });
  }

  for (const ch of input.channels) {
    if (ch !== "influencer") continue;
    await supabase.from("brand_assets").insert({
      tenant_id: input.tenantId,
      campaign_id: input.campaignId,
      name: "Influencer creative pack",
      status: "draft",
    });
  }
}

export { lineTypeForChannelKey };
