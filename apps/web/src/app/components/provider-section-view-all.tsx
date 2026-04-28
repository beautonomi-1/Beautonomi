"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import EmptyState from "@/components/ui/empty-state";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import { useUserLocation } from "@/hooks/useUserLocation";
import ProviderCard from "@/app/home/components/provider-card-dynamic";
import type { PublicProviderCard } from "@/types/beautonomi";

type SectionKey = "top-rated" | "sponsored" | "nearest" | "hottest" | "upcoming";

const SECTION_COPY: Record<SectionKey, { title: string; subtitle: string; empty: string }> = {
  "top-rated": {
    title: "Top Rated",
    subtitle: "Highly reviewed providers with strong service quality.",
    empty: "No top rated providers are available yet.",
  },
  sponsored: {
    title: "Sponsored",
    subtitle: "Boosted providers relevant to your area and browsing intent.",
    empty: "No sponsored providers are available right now.",
  },
  nearest: {
    title: "Nearest Providers",
    subtitle: "Providers ordered around your selected or estimated location.",
    empty: "No nearby providers are available yet.",
  },
  hottest: {
    title: "Hottest Picks",
    subtitle: "Popular and high-quality providers customers are choosing.",
    empty: "No trending providers are available yet.",
  },
  upcoming: {
    title: "Upcoming Talent",
    subtitle: "Newer providers building momentum on Beautonomi.",
    empty: "No upcoming talent is available yet.",
  },
};

const PAGE_SIZE = 24;

function searchSortForSection(section: SectionKey): string {
  if (section === "top-rated") return "rating";
  if (section === "nearest") return "distance";
  if (section === "upcoming") return "newest";
  return "relevance";
}

export default function ProviderSectionViewAll({ section }: { section: SectionKey }) {
  const { location } = useUserLocation();
  const copy = SECTION_COPY[section];
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [allSponsored, setAllSponsored] = useState<PublicProviderCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sponsoredLabel, setSponsoredLabel] = useState("Sponsored");

  const locationParams = useMemo(() => {
    const params = new URLSearchParams();
    if (location?.latitude != null && location?.longitude != null) {
      params.set("lat", String(location.latitude));
      params.set("lng", String(location.longitude));
    }
    return params;
  }, [location?.latitude, location?.longitude]);

  const loadSearchPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const params = new URLSearchParams(locationParams);
      params.set("page", String(nextPage));
      params.set("limit", String(PAGE_SIZE));
      params.set("sort_by", searchSortForSection(section));
      if (section === "top-rated") params.set("rating_min", "1");
      const response = await fetcher.get<{
        data: { providers: PublicProviderCard[]; has_more: boolean };
      }>(`/api/public/search?${params.toString()}`);
      const nextProviders = response.data?.providers ?? [];
      setProviders((prev) => (append ? [...prev, ...nextProviders] : nextProviders));
      setHasMore(Boolean(response.data?.has_more));
      setPage(nextPage);
    },
    [locationParams, section],
  );

  const loadSponsored = useCallback(async () => {
    const params = new URLSearchParams(locationParams);
    const response = await fetcher.get<{
      data: { sponsored?: PublicProviderCard[]; ads_disclosure_label?: string };
    }>(`/api/public/home${params.size ? `?${params.toString()}` : ""}`);
    const sponsored = response.data?.sponsored ?? [];
    const label = String(response.data?.ads_disclosure_label ?? "Sponsored").trim() || "Sponsored";
    setSponsoredLabel(label);
    setAllSponsored(sponsored);
    setProviders(sponsored.slice(0, PAGE_SIZE));
    setHasMore(sponsored.length > PAGE_SIZE);
    setPage(1);
  }, [locationParams]);

  const loadInitial = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      if (section === "sponsored") await loadSponsored();
      else await loadSearchPage(1, false);
    } catch (err) {
      const message =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
            ? err.message
            : "Failed to load providers.";
      setError(message);
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  }, [loadSearchPage, loadSponsored, section]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = async () => {
    try {
      setIsLoadingMore(true);
      if (section === "sponsored") {
        const nextPage = page + 1;
        const nextVisible = allSponsored.slice(0, nextPage * PAGE_SIZE);
        setProviders(nextVisible);
        setHasMore(nextVisible.length < allSponsored.length);
        setPage(nextPage);
      } else {
        await loadSearchPage(page + 1, true);
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const title = section === "sponsored" ? sponsoredLabel : copy.title;

  if (isLoading) {
    return (
      <div className="mb-10 mt-7">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage={`Loading ${title.toLowerCase()}...`} />
        </div>
      </div>
    );
  }

  return (
    <main className="mb-10 mt-7">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="mb-8 rounded-[2rem] border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-amber-50 p-6 md:p-8">
          <Link href="/" className="inline-flex items-center text-sm text-gray-600 hover:text-[#FF0077] mb-5">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to home
          </Link>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-gray-950">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm md:text-base text-gray-600">{copy.subtitle}</p>
        </div>

        {error ? (
          <EmptyState
            title="Failed to load providers"
            description={error}
            action={{ label: "Retry", onClick: loadInitial }}
          />
        ) : providers.length === 0 ? (
          <EmptyState title={copy.empty} description="Try again later or browse all providers from search." />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 md:gap-7">
              {providers.map((provider) => (
                <ProviderCard
                  key={`${section}-${provider.id}`}
                  provider={provider}
                  showTopRatedBadge={section === "top-rated"}
                  showNearestBadge={section === "nearest"}
                  showHottestBadge={section === "hottest"}
                  showUpcomingTalentBadge={section === "upcoming"}
                  sponsoredBadgeText={section === "sponsored" ? sponsoredLabel : undefined}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <Button onClick={loadMore} disabled={isLoadingMore} size="lg" className="rounded-full px-8">
                  {isLoadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Load more providers
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
