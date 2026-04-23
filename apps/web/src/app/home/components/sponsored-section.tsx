"use client";

import React, { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card-dynamic";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useUserLocation } from "@/hooks/useUserLocation";
import { fetchPublicHomeClient } from "@/app/home/fetch-public-home-client";
import { cn } from "@/lib/utils";

/**
 * Sponsored / boosted listings. Only rendered when ads module is enabled and API returns sponsored.
 */
type SponsoredSectionProps = {
  categorySlug?: string;
  initialProviders?: PublicProviderCard[];
  initialHydrated?: boolean;
};

export default function SponsoredSection({
  categorySlug = "all",
  initialProviders,
  initialHydrated = false,
}: SponsoredSectionProps) {
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean; disclosure_label?: string | null } | undefined;
  const sponsoredHeading = (adsConfig?.disclosure_label || "Sponsored").trim() || "Sponsored";
  const sponsoredBadgeText = sponsoredHeading;
  const sponsoredEnabled = useFeatureFlag("ads.sponsored_slots.enabled");
  const { location: userLocation } = useUserLocation();
  const enabled = Boolean(adsConfig?.enabled) && sponsoredEnabled;
  const [providers, setProviders] = useState<PublicProviderCard[]>(() =>
    initialHydrated ? (initialProviders ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(() => enabled && !initialHydrated);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const prevInitialProvidersRef = useRef(initialProviders);

  useEffect(() => {
    if (!initialHydrated) return;
    if (prevInitialProvidersRef.current === initialProviders) return;
    prevInitialProvidersRef.current = initialProviders;
    setProviders(initialProviders ?? []);
  }, [initialHydrated, initialProviders]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const silent = providers.length > 0;
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const params = new URLSearchParams();
        if (userLocation?.latitude != null && userLocation?.longitude != null) {
          params.set("lat", String(userLocation.latitude));
          params.set("lng", String(userLocation.longitude));
        }
        if (categorySlug && categorySlug !== "all") {
          params.set("category", categorySlug);
        }
        const res = await fetchPublicHomeClient(params);
        if (cancelled) return;
        setProviders(res.data?.sponsored ?? []);
      } catch {
        if (!cancelled) setProviders([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userLocation?.latitude, userLocation?.longitude, categorySlug]);

  if (!enabled) return null;
  if (isLoading && providers.length === 0) return null;
  if (!isLoading && !isRefreshing && providers.length === 0) return null;

  return (
    <section
      className={cn(
        "mb-8 md:mb-12",
        isRefreshing && "opacity-60 transition-opacity duration-150",
      )}
      aria-busy={isRefreshing}
    >
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">{sponsoredHeading}</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {providers.slice(0, 8).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} sponsoredBadgeText={sponsoredBadgeText} />
          ))}
        </div>
      </div>
    </section>
  );
}
