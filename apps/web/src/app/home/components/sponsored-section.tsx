"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";

/**
 * Sponsored / boosted listings. Only rendered when ads module is enabled and API returns sponsored.
 */
export default function SponsoredSection() {
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const sponsoredEnabled = useFeatureFlag("ads.sponsored_slots.enabled");
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const enabled = Boolean(adsConfig?.enabled) && sponsoredEnabled;
  if (!enabled) return null;

  useEffect(() => {
    if (!enabled) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetcher.get<{ data: { sponsored?: PublicProviderCard[] } }>("/api/public/home");
        setProviders(res.data?.sponsored ?? []);
      } catch {
        setProviders([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [enabled]);

  if (isLoading || providers.length === 0) return null;

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
