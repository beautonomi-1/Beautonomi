export type KpiSource = "measured" | "entered" | "derived";
export type KpiUnit = "count" | "zar" | "percent";
export type KpiDirection = "higher" | "lower";

export type KpiCatalogEntry = {
  key: string;
  label: string;
  unit: KpiUnit;
  direction: KpiDirection;
  source: KpiSource;
  measuredField?: keyof import("./measured").MeasuredCampaignSlice;
  enteredKey?: string;
  derive?: (parts: Record<string, number>) => number | null;
  successMetric?: "demand" | "supply" | "both";
};

const catalog: KpiCatalogEntry[] = [
  { key: "signups", label: "Signups", unit: "count", direction: "higher", source: "measured", measuredField: "signups", successMetric: "demand" },
  { key: "promo_redemptions", label: "Promo redemptions", unit: "count", direction: "higher", source: "measured", measuredField: "promo_redemptions", successMetric: "demand" },
  { key: "attributed_booking_value", label: "Attributed booking value", unit: "zar", direction: "higher", source: "measured", measuredField: "attributed_booking_value", successMetric: "demand" },
  { key: "coupon_redeems", label: "Coupon redeems", unit: "count", direction: "higher", source: "measured", measuredField: "coupon_redeems", successMetric: "demand" },
  { key: "referral_completions", label: "Referral completions", unit: "count", direction: "higher", source: "measured", measuredField: "referral_completions", successMetric: "demand" },
  { key: "ads_clicks", label: "Ad clicks", unit: "count", direction: "higher", source: "measured", measuredField: "ads_clicks", successMetric: "demand" },
  { key: "broadcast_recipients", label: "Broadcast recipients", unit: "count", direction: "higher", source: "measured", measuredField: "broadcast_recipients", successMetric: "demand" },
  { key: "waitlist_rows", label: "Waitlist signups", unit: "count", direction: "higher", source: "measured", measuredField: "waitlist_rows", successMetric: "demand" },
  { key: "leads_created", label: "Leads created", unit: "count", direction: "higher", source: "measured", measuredField: "leads_created", successMetric: "supply" },
  { key: "leads_won", label: "Leads won", unit: "count", direction: "higher", source: "measured", measuredField: "leads_won", successMetric: "supply" },
  { key: "reach", label: "Reach", unit: "count", direction: "higher", source: "entered", enteredKey: "reach", successMetric: "both" },
  { key: "clicks", label: "Clicks", unit: "count", direction: "higher", source: "entered", enteredKey: "clicks", successMetric: "both" },
  { key: "known_spend", label: "Known spend", unit: "zar", direction: "lower", source: "entered", enteredKey: "spend", successMetric: "both" },
  {
    key: "cost_per_signup",
    label: "Cost per signup",
    unit: "zar",
    direction: "lower",
    source: "derived",
    successMetric: "demand",
    derive: (p) => (p.signups > 0 ? p.known_spend / p.signups : null),
  },
  {
    key: "roas",
    label: "ROAS",
    unit: "percent",
    direction: "higher",
    source: "derived",
    successMetric: "demand",
    derive: (p) => (p.known_spend > 0 ? (p.attributed_booking_value / p.known_spend) * 100 : null),
  },
  {
    key: "lead_win_rate",
    label: "Lead win rate",
    unit: "percent",
    direction: "higher",
    source: "derived",
    successMetric: "supply",
    derive: (p) => (p.leads_created > 0 ? (p.leads_won / p.leads_created) * 100 : null),
  },
  {
    key: "click_through_rate",
    label: "Click-through rate",
    unit: "percent",
    direction: "higher",
    source: "derived",
    successMetric: "demand",
    derive: (p) => (p.reach > 0 ? (p.clicks / p.reach) * 100 : null),
  },
];

export function getKpiCatalog(): KpiCatalogEntry[] {
  return catalog;
}

export function getKpiByKey(key: string): KpiCatalogEntry | undefined {
  return catalog.find((k) => k.key === key);
}

export function filterKpisForSuccessMetric(metric: "demand" | "supply"): KpiCatalogEntry[] {
  return catalog.filter((k) => k.successMetric === metric || k.successMetric === "both");
}
