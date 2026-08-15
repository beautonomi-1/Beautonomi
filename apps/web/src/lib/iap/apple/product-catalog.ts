/**
 * Canonical Apple IAP product catalogue for Beautonomi Partner (iOS).
 * Product IDs are permanent — must match App Store Connect exactly.
 */

export const APPLE_BUNDLE_ID = "com.beautonomi.partner";
export const APPLE_SUBSCRIPTION_GROUP_REF = "Beautonomi Partner Plans";
export const APPLE_SUBSCRIPTION_GROUP_DISPLAY = "Beautonomi Partner";

/** Default commission under Apple Small Business Program (override via env/admin). */
export const DEFAULT_APPLE_COMMISSION_RATE = 0.15;

export type AppleProductKind = "subscription" | "consumable";

export type AppleSetupSheetRow = {
  ascType: "Auto-Renewable Subscription" | "Consumable";
  referenceName: string;
  productId: string;
  duration?: string;
  groupLevel?: number;
  webPriceZar: number;
  targetApplePriceZar: number;
  displayName: string;
  description: string;
  refTable: string;
  refKey: string;
};

export function planSlugToProductSlug(planSlug: string): string {
  return planSlug.replace(/^beautonomi-/, "").trim();
}

export function subscriptionProductId(
  planSlug: string,
  billingPeriod: "monthly" | "yearly",
): string {
  return `com.beautonomi.partner.sub.${planSlugToProductSlug(planSlug)}.${billingPeriod}`;
}

export function adsTimePackProductId(durationDays: number): string {
  return `com.beautonomi.partner.ads.time.${durationDays}d`;
}

export function adsImpressionPackProductId(impressions: number): string {
  return `com.beautonomi.partner.ads.impressions.${impressions}`;
}

/** Apple price = web price / (1 - commission). */
export function computeAppleTargetPriceZar(
  webPriceZar: number,
  commissionRate = DEFAULT_APPLE_COMMISSION_RATE,
): number {
  if (webPriceZar <= 0) return 0;
  const rate = Math.min(Math.max(commissionRate, 0), 0.99);
  return Math.round((webPriceZar / (1 - rate)) * 100) / 100;
}

/** Nearest Apple ZAR tier at or above target (common App Store price ladder). */
export function nearestApplePricePointZar(targetZar: number): number {
  const ladder = [
    0, 4.99, 9.99, 14.99, 19.99, 24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 59.99, 69.99,
    79.99, 89.99, 99.99, 109.99, 119.99, 129.99, 149.99, 169.99, 179.99, 199.99, 229.99,
    249.99, 299.99, 349.99, 399.99, 449.99, 499.99, 599.99, 699.99, 799.99, 899.99, 999.99,
    1199.99, 1499.99, 1999.99, 2499.99, 2999.99, 3499.99, 3999.99,
  ];
  for (const p of ladder) {
    if (p >= targetZar - 0.001) return p;
  }
  return Math.ceil(targetZar);
}

/** Static catalogue aligned with seeded plans/packs (392, 263, 459 migrations). */
export const STATIC_APPLE_CATALOG: AppleSetupSheetRow[] = [
  {
    ascType: "Auto-Renewable Subscription",
    referenceName: "Beautonomi Growth Monthly",
    productId: "com.beautonomi.partner.sub.growth.monthly",
    duration: "1 month",
    groupLevel: 2,
    webPriceZar: 99,
    targetApplePriceZar: computeAppleTargetPriceZar(99),
    displayName: "Growth Monthly",
    description: "Bookings, team and marketing tools.",
    refTable: "subscription_plans",
    refKey: "beautonomi-growth:monthly",
  },
  {
    ascType: "Auto-Renewable Subscription",
    referenceName: "Beautonomi Growth Yearly",
    productId: "com.beautonomi.partner.sub.growth.yearly",
    duration: "1 year",
    groupLevel: 2,
    webPriceZar: 990,
    targetApplePriceZar: computeAppleTargetPriceZar(990),
    displayName: "Growth Yearly",
    description: "Bookings, team and marketing. Billed yearly.",
    refTable: "subscription_plans",
    refKey: "beautonomi-growth:yearly",
  },
  {
    ascType: "Auto-Renewable Subscription",
    referenceName: "Beautonomi Scale Monthly",
    productId: "com.beautonomi.partner.sub.scale.monthly",
    duration: "1 month",
    groupLevel: 1,
    webPriceZar: 299,
    targetApplePriceZar: computeAppleTargetPriceZar(299),
    displayName: "Scale Monthly",
    description: "Multi-location, ads and advanced reports.",
    refTable: "subscription_plans",
    refKey: "beautonomi-scale:monthly",
  },
  {
    ascType: "Auto-Renewable Subscription",
    referenceName: "Beautonomi Scale Yearly",
    productId: "com.beautonomi.partner.sub.scale.yearly",
    duration: "1 year",
    groupLevel: 1,
    webPriceZar: 2990,
    targetApplePriceZar: computeAppleTargetPriceZar(2990),
    displayName: "Scale Yearly",
    description: "Multi-location and ads. Billed yearly.",
    refTable: "subscription_plans",
    refKey: "beautonomi-scale:yearly",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Time Pack 1 Day",
    productId: "com.beautonomi.partner.ads.time.1d",
    webPriceZar: 29,
    targetApplePriceZar: computeAppleTargetPriceZar(29),
    displayName: "1 Day Ad Boost",
    description: "Featured placement for 24 hours.",
    refTable: "ads_time_packs",
    refKey: "1",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Time Pack 3 Days",
    productId: "com.beautonomi.partner.ads.time.3d",
    webPriceZar: 69,
    targetApplePriceZar: computeAppleTargetPriceZar(69),
    displayName: "3 Day Ad Boost",
    description: "Featured placement for 3 days.",
    refTable: "ads_time_packs",
    refKey: "3",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Time Pack 7 Days",
    productId: "com.beautonomi.partner.ads.time.7d",
    webPriceZar: 149,
    targetApplePriceZar: computeAppleTargetPriceZar(149),
    displayName: "7 Day Ad Boost",
    description: "Featured placement for 7 days.",
    refTable: "ads_time_packs",
    refKey: "7",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Time Pack 14 Days",
    productId: "com.beautonomi.partner.ads.time.14d",
    webPriceZar: 249,
    targetApplePriceZar: computeAppleTargetPriceZar(249),
    displayName: "14 Day Ad Boost",
    description: "Featured placement for 14 days.",
    refTable: "ads_time_packs",
    refKey: "14",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Time Pack 30 Days",
    productId: "com.beautonomi.partner.ads.time.30d",
    webPriceZar: 399,
    targetApplePriceZar: computeAppleTargetPriceZar(399),
    displayName: "30 Day Ad Boost",
    description: "Featured placement for 30 days.",
    refTable: "ads_time_packs",
    refKey: "30",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Impression Pack 50",
    productId: "com.beautonomi.partner.ads.impressions.50",
    webPriceZar: 25,
    targetApplePriceZar: computeAppleTargetPriceZar(25),
    displayName: "50 Ad Impressions",
    description: "50 sponsored impressions in search.",
    refTable: "ads_impression_packs",
    refKey: "50",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Impression Pack 100",
    productId: "com.beautonomi.partner.ads.impressions.100",
    webPriceZar: 45,
    targetApplePriceZar: computeAppleTargetPriceZar(45),
    displayName: "100 Ad Impressions",
    description: "100 sponsored impressions in search.",
    refTable: "ads_impression_packs",
    refKey: "100",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Impression Pack 500",
    productId: "com.beautonomi.partner.ads.impressions.500",
    webPriceZar: 200,
    targetApplePriceZar: computeAppleTargetPriceZar(200),
    displayName: "500 Ad Impressions",
    description: "500 sponsored impressions in search.",
    refTable: "ads_impression_packs",
    refKey: "500",
  },
  {
    ascType: "Consumable",
    referenceName: "Ads Impression Pack 1000",
    productId: "com.beautonomi.partner.ads.impressions.1000",
    webPriceZar: 350,
    targetApplePriceZar: computeAppleTargetPriceZar(350),
    displayName: "1000 Ad Impressions",
    description: "1000 sponsored impressions in search.",
    refTable: "ads_impression_packs",
    refKey: "1000",
  },
];

export function setupSheetToCsv(rows: AppleSetupSheetRow[]): string {
  const header =
    "Type,Reference Name,Product ID,Duration,Group Level,Web Price ZAR,Target Apple Price ZAR,Display Name,Description";
  const lines = rows.map((r) =>
    [
      r.ascType,
      r.referenceName,
      r.productId,
      r.duration ?? "",
      r.groupLevel ?? "",
      r.webPriceZar.toFixed(2),
      r.targetApplePriceZar.toFixed(2),
      r.displayName,
      r.description,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...lines].join("\n");
}
