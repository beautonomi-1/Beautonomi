"use client";

import { useTranslation } from "@beautonomi/i18n";

import ProviderCard from "@/app/home/components/provider-card";
import type { PublicProviderCard } from "@/types/beautonomi";

type Props = {
  businessName?: string | null;
  thumbnailUrl?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  isVerified?: boolean;
  description?: string | null;
  businessType?: "freelancer" | "salon" | null;
  className?: string;
};

/** Sponsored-slot preview using the same customer `ProviderCard` with `is_sponsored`. */
export function AdsPlacementPreview({
  businessName,
  thumbnailUrl,
  avatarUrl,
  city,
  rating,
  reviewCount,
  isVerified,
  description,
  businessType,
  className,
}: Props) {
  const { t } = useTranslation();
  const title = businessName?.trim() || t("web.providerExtras.yourBusinessName");
  const reviews = Number(reviewCount);
  const score = Number(rating);
  const provider: PublicProviderCard = {
    id: "preview",
    slug: "preview",
    business_name: title,
    business_type: businessType === "freelancer" ? "freelancer" : "salon",
    rating: Number.isFinite(score) && score > 0 ? score : 0,
    review_count: Number.isFinite(reviews) && reviews > 0 ? reviews : 0,
    thumbnail_url: thumbnailUrl ?? null,
    avatar_url: avatarUrl ?? null,
    city: city?.trim() || "",
    country: "ZA",
    is_featured: false,
    is_verified: Boolean(isVerified),
    currency: "ZAR",
    description: description?.trim() || null,
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
