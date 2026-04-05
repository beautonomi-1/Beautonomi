"use client";

import React, { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card-dynamic";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useUserLocation } from "@/hooks/useUserLocation";
import { PUBLIC_HOME_CLIENT_TIMEOUT_MS } from "@/app/home/home-public-api";

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
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const sponsoredEnabled = useFeatureFlag("ads.sponsored_slots.enabled");
  const { location: userLocation } = useUserLocation();
  const enabled = Boolean(adsConfig?.enabled) && sponsoredEnabled;
  const [providers, setProviders] = useState<PublicProviderCard[]>(() =>
    initialHydrated ? (initialProviders ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(() => enabled && !initialHydrated);

  useEffect(() => {
    if (!enabled) return;
    const load = async (silent: boolean) => {
      if (!silent) setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (userLocation?.latitude != null && userLocation?.longitude != null) {
          params.set("lat", String(userLocation.latitude));
          params.set("lng", String(userLocation.longitude));
        }
        if (categorySlug && categorySlug !== "all") {
          params.set("category", categorySlug);
        }
        const query = params.toString();
        const res = await fetcher.get<{ data: { sponsored?: PublicProviderCard[] } }>(
          `/api/public/home${query ? `?${query}` : ""}`,
          { timeoutMs: PUBLIC_HOME_CLIENT_TIMEOUT_MS },
        );
        setProviders(res.data?.sponsored ?? []);
      } catch {
        setProviders([]);
      } finally {
        setIsLoading(false);
      }
    };
    if (!initialHydrated) {
      void load(false);
      return;
    }
    if (userLocation?.latitude != null && userLocation?.longitude != null) {
      void load(true);
    }
  }, [
    enabled,
    userLocation?.latitude,
    userLocation?.longitude,
    categorySlug,
    initialHydrated,
  ]);

  if (!enabled || isLoading || providers.length === 0) return null;

  return (
    <section className="mb-8 md:mb-12">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">Sponsored</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {providers.slice(0, 8).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </div>
    </section>
  );
}
