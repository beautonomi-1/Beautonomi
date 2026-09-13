"use client";

import { useTranslation } from "@beautonomi/i18n";

import ProviderCard from "@/app/home/components/provider-card";
import type { PublicProviderCard } from "@/types/beautonomi";

type Props = {
  businessName?: string | null;
  headline?: string | null;
  thumbnailUrl?: string | null;
  city?: string | null;
  className?: string;
};

/** Sponsored-slot preview using the same customer `ProviderCard` with `is_sponsored`. */
export function AdsPlacementPreview({
  businessName,
  headline,
  thumbnailUrl,
  city,
  className,
}: Props) {
  const { t } = useTranslation();
  const title = headline?.trim() || businessName?.trim() || t("web.providerExtras.yourBusinessName");
  const provider: PublicProviderCard = {
    id: "preview",
    slug: "preview",
    business_name: title,
    business_type: "salon",
    rating: 4.8,
    review_count: 24,
    thumbnail_url: thumbnailUrl ?? null,
    city: city?.trim() || t("web.providerExtras.johannesburg"),
    country: "ZA",
    is_featured: false,
    is_verified: true,
    starting_price: 250,
    currency: "ZAR",
    description: t("web.providerExtras.listingPreviewHint"),
    is_sponsored: true,
    campaign_id: "preview",
  };

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("web.providerExtras.sponsoredPlacementPreview")}
      </p>
      <div className="pointer-events-none max-w-sm">
        <ProviderCard provider={provider} sponsoredBadgeText={t("web.providerExtras.sponsored")} />
      </div>
    </div>
  );
}
