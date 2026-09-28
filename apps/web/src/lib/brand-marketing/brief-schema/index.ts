import { z } from "zod";
import { UNATTRIBUTABLE_CHANNELS } from "../types";

export type FieldTier = "required" | "recommended" | "optional" | "hidden";

export type BriefFieldDef = {
  key: string;
  label: string;
  tier: FieldTier;
  reason?: string;
};

export type BriefSectionDef = {
  key: string;
  title: string;
  fields: BriefFieldDef[];
};

export const CAMPAIGN_TYPE_KEYS = [
  "brand_awareness",
  "product_launch",
  "seasonal_offer",
  "city_launch",
  "provider_acquisition",
  "always_on_performance",
  "influencer",
  "event_sponsorship",
  "partnership",
  "crm_lifecycle",
  "pr_content",
] as const;

export type CampaignTypeKey = (typeof CAMPAIGN_TYPE_KEYS)[number];

export type BriefSchemaInput = {
  campaign_type: CampaignTypeKey;
  channels_requested: string[];
  budget_envelope?: number | null;
  success_metric?: "demand" | "supply";
  go_live_budget_threshold?: number;
  values?: Record<string, unknown>;
};

const CORE_REQUIRED = [
  "name",
  "business_problem",
  "objective",
  "success_target",
  "proposition",
  "budget_envelope",
  "flight_start",
  "flight_end",
  "pillar_id",
  "plan_id",
] as const;

const CORE_RECOMMENDED = ["insight", "reasons_to_believe", "tone", "mandatories"] as const;

const TYPE_SECTIONS: Record<CampaignTypeKey, string[]> = {
  brand_awareness: ["reach_targets", "hero_message"],
  product_launch: ["launch_date", "product_readiness", "pricing_faq"],
  seasonal_offer: ["offer_mechanics", "promo_link", "terms"],
  city_launch: ["city", "supply_readiness"],
  provider_acquisition: ["provider_segment", "onboarding_offer"],
  always_on_performance: ["cpa_target", "refresh_cadence"],
  influencer: ["creator_deliverables", "usage_rights", "disclosure"],
  event_sponsorship: ["venue_date", "lead_capture"],
  partnership: ["partner_obligations", "data_sharing"],
  crm_lifecycle: ["segment_trigger", "opt_in_basis"],
  pr_content: ["story_angle", "embargo"],
};

function field(key: string, label: string, tier: FieldTier, reason?: string): BriefFieldDef {
  return { key, label, tier, reason };
}

export function resolveBriefSchema(input: BriefSchemaInput): BriefSectionDef[] {
  const sections: BriefSectionDef[] = [];
  const coreFields: BriefFieldDef[] = [
    ...CORE_REQUIRED.map((k) => field(k, k.replace(/_/g, " "), "required")),
    ...CORE_RECOMMENDED.map((k) => field(k, k.replace(/_/g, " "), "recommended")),
    field("notes", "Notes", "optional"),
  ];

  if (input.success_metric === "supply") {
    coreFields.push(field("provider_segment", "Provider segment", "required", "Supply metric selected"));
  }

  sections.push({ key: "core", title: "Core", fields: coreFields });

  const extra = TYPE_SECTIONS[input.campaign_type] ?? [];
  if (extra.length) {
    sections.push({
      key: "type_specific",
      title: "Campaign type",
      fields: extra.map((k) => field(k, k.replace(/_/g, " "), "required")),
    });
  }

  const channelFields: BriefFieldDef[] = [];
  for (const ch of input.channels_requested) {
    if (["meta", "google", "tiktok", "display", "youtube"].includes(ch)) {
      channelFields.push(field(`targeting_${ch}`, `${ch} targeting`, "recommended"));
    }
    if (ch === "influencer") {
      channelFields.push(field("influencer_disclosure", "#ad disclosure", "required", "Influencer channel"));
      channelFields.push(field("usage_rights", "Usage rights", "required", "Influencer channel"));
    }
    if (ch === "podcast") {
      channelFields.push(field("podcast_show", "Show / network", "required", "Podcast placement"));
      channelFields.push(
        field("podcast_host_read", "Host-read required", "recommended", "Podcast placement"),
      );
      channelFields.push(field("podcast_promo_code", "On-air promo code", "recommended", "Podcast placement"));
      channelFields.push(
        field("podcast_measurement", "Attribution method", "required", "Podcast cannot use site tracking alone"),
      );
    }
    if (UNATTRIBUTABLE_CHANNELS.has(ch) && ch !== "podcast") {
      channelFields.push(
        field(`unattrib_${ch}`, `${ch} measurement`, "required", "Channel cannot carry a tracking code"),
      );
    }
    if (["owned_email", "owned_sms", "owned_push", "owned_whatsapp"].includes(ch)) {
      channelFields.push(field(`popia_${ch}`, "POPIA opt-in basis", "required", "CRM send"));
    }
  }
  if (channelFields.length) {
    sections.push({ key: "channels", title: "Channels", fields: channelFields });
  }

  const envelope = Number(input.budget_envelope ?? 0);
  const threshold = Number(input.go_live_budget_threshold ?? 50000);
  if (envelope > threshold) {
    sections.push({
      key: "finance",
      title: "Finance",
      fields: [field("budget_rationale", "Budget rationale", "required", `Budget above ${threshold}`)],
    });
  }

  return sections;
}

export const briefSubmitSchema = z.object({
  name: z.string().min(1),
  campaign_type: z.enum(CAMPAIGN_TYPE_KEYS),
  business_problem: z.string().min(1),
  objective: z.string().min(1),
  proposition: z.string().min(1),
  budget_envelope: z.coerce.number().optional(),
  flight_start: z.string().optional(),
  flight_end: z.string().optional(),
  success_target: z.coerce.number().optional(),
  channels_requested: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export function computeBriefQualityScore(
  values: Record<string, unknown>,
  schema: BriefSectionDef[],
): number {
  let required = 0;
  let done = 0;
  for (const section of schema) {
    for (const f of section.fields) {
      if (f.tier !== "required") continue;
      required++;
      const v = values[f.key];
      if (v != null && String(v).trim() !== "") done++;
    }
  }
  if (required === 0) return 100;
  return Math.round((done / required) * 100);
}
