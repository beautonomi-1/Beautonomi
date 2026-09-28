export type BrandCampaignStage = "planning" | "creative" | "live" | "measuring" | "closed";

export const BRAND_CAMPAIGN_STAGES: BrandCampaignStage[] = [
  "planning",
  "creative",
  "live",
  "measuring",
  "closed",
];

export type BrandStageMeta = {
  label: string;
  dotClass: string;
  barClass: string;
  description: string;
};

export const STAGE_META: Record<BrandCampaignStage, BrandStageMeta> = {
  planning: {
    label: "Planning",
    dotClass: "bg-zinc-400",
    barClass: "bg-zinc-400",
    description: "Define flight dates, budget, and strategy link.",
  },
  creative: {
    label: "Creative",
    dotClass: "bg-violet-500",
    barClass: "bg-violet-500",
    description: "Build placements, assets, and approvals.",
  },
  live: {
    label: "Live",
    dotClass: "bg-emerald-500",
    barClass: "bg-emerald-500",
    description: "Campaign is in market; spend and reach are tracked.",
  },
  measuring: {
    label: "Measuring",
    dotClass: "bg-amber-500",
    barClass: "bg-amber-500",
    description: "Flight ended; capture outcomes and learnings.",
  },
  closed: {
    label: "Closed",
    dotClass: "bg-zinc-300",
    barClass: "bg-zinc-300",
    description: "Archived; read-only except duplication.",
  },
};

/** Shared admin-style controls for Brand desk pages */
export const brandSelectClass =
  "h-9 min-h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary/40";
export const brandButtonSecondaryClass =
  "inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm hover:bg-gray-50";
export const brandButtonPrimaryClass =
  "inline-flex h-9 items-center rounded-xl bg-violet-700 px-3 text-sm font-medium text-white hover:bg-violet-800";
