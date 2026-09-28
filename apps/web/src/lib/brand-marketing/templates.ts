export type BrandBriefTemplateKey = "city_launch" | "seasonal_offer" | "provider_acquisition";

export const BRAND_BRIEF_TEMPLATES: Record<
  BrandBriefTemplateKey,
  {
    label: string;
    objective: string;
    success_metric: "demand" | "supply";
    channels_requested: string[];
    line_mix: string[];
  }
> = {
  city_launch: {
    label: "City launch",
    objective: "Drive customer signups and first bookings in a new city.",
    success_metric: "demand",
    channels_requested: ["google", "meta", "influencer", "owned_email", "waitlist"],
    line_mix: ["paid", "influencer", "owned"],
  },
  seasonal_offer: {
    label: "Seasonal offer",
    objective: "Promote a limited-time offer with a trackable promo code.",
    success_metric: "demand",
    channels_requested: ["google", "meta", "owned_email", "owned_sms", "promo"],
    line_mix: ["paid", "owned"],
  },
  provider_acquisition: {
    label: "Provider acquisition",
    objective: "Generate qualified salon leads and won providers.",
    success_metric: "supply",
    channels_requested: ["google", "events", "provider_leads", "owned_email"],
    line_mix: ["paid", "event", "owned"],
  },
};
