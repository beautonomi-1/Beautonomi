export type BrandBriefStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "accepted"
  | "rejected"
  | "parked";

export type BrandCampaignStage = "planning" | "creative" | "live" | "measuring" | "closed";

export type BrandSuccessMetric = "demand" | "supply";

export type BrandLineType =
  | "paid"
  | "influencer"
  | "offline"
  | "owned"
  | "production"
  | "research"
  | "sponsorship"
  | "event";

export type BrandMetricSource = "measured" | "entered" | "amplitude_pointer";

export const BRAND_CAMPAIGN_STAGES: BrandCampaignStage[] = [
  "planning",
  "creative",
  "live",
  "measuring",
  "closed",
];

export const UNATTRIBUTABLE_CHANNELS = new Set([
  "tv",
  "radio",
  "outdoor",
  "print",
  "cinema",
  "podcast",
  "press",
]);
