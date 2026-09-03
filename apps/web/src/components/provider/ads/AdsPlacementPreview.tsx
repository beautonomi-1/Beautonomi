"use client";

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
  const title = headline?.trim() || businessName?.trim() || "Your business name";
  const provider: PublicProviderCard = {
    id: "preview",
    slug: "preview",
    business_name: title,
    business_type: "salon",
    rating: 4.8,
    review_count: 24,
    thumbnail_url: thumbnailUrl ?? null,
    city: city?.trim() || "Johannesburg",
    country: "ZA",
    is_featured: false,
    is_verified: true,
    starting_price: 250,
    currency: "ZAR",
    description: "How your listing may appear in search and home sponsored rows.",
    is_sponsored: true,
    campaign_id: "preview",
  };

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sponsored placement preview
      </p>
      <div className="pointer-events-none max-w-sm">
        <ProviderCard provider={provider} sponsoredBadgeText="Sponsored" />
      </div>
    </div>
  );
}
