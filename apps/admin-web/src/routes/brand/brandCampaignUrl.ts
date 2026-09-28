export type BrandCampaignDetailTab = "overview" | "placements" | "creative" | "performance" | "audience";

export const BRAND_CAMPAIGN_DETAIL_TABS: BrandCampaignDetailTab[] = [
  "overview",
  "placements",
  "creative",
  "performance",
  "audience",
];

/** Maps legacy tab query values and validates current tabs. */
export function parseBrandCampaignDetailTab(raw: string | null): BrandCampaignDetailTab {
  if (raw === "results" || raw === "funnel" || raw === "metrics") return "performance";
  if (raw && BRAND_CAMPAIGN_DETAIL_TABS.includes(raw as BrandCampaignDetailTab)) {
    return raw as BrandCampaignDetailTab;
  }
  return "overview";
}
