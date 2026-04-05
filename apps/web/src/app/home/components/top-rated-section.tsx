"use client";
import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card-dynamic";
import { useUserLocation } from "@/hooks/useUserLocation";
import { PUBLIC_HOME_CLIENT_TIMEOUT_MS } from "@/app/home/home-public-api";
import Stars from '../../../../public/images/Group 1.8f1d86be 1.svg';

// Use static strings to avoid useTranslation() running before i18n is ready (prevents hook-order and .length errors)
const LABEL_TOP_RATED = "Top rated";
const LABEL_VIEW_ALL = "View all";

type TopRatedSectionProps = {
  categorySlug?: string;
  /** From RSC `/` — avoids duplicate client waterfall on first paint */
  initialProviders?: PublicProviderCard[];
  initialHydrated?: boolean;
};

const TopRatedSection = ({
  categorySlug = "all",
  initialProviders,
  initialHydrated = false,
}: TopRatedSectionProps) => {
  const [providers, setProviders] = useState<PublicProviderCard[]>(() =>
    initialHydrated ? (initialProviders ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(() => !initialHydrated);
  const [error, setError] = useState<string | null>(null);
  const { location: userLocation } = useUserLocation();

  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    window.location.reload();
  }, []);

  useEffect(() => {
    const loadData = async (silent: boolean) => {
      try {
        if (!silent) setIsLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (userLocation?.latitude != null && userLocation?.longitude != null) {
          params.set("lat", String(userLocation.latitude));
          params.set("lng", String(userLocation.longitude));
        }
        if (categorySlug && categorySlug !== "all") {
          params.set("category", categorySlug);
        }
        const query = params.toString();
        const response = await fetcher.get<{
          data?: { topRated?: PublicProviderCard[] };
          error?: null;
        }>(`/api/public/home${query ? `?${query}` : ""}`, {
          timeoutMs: PUBLIC_HOME_CLIENT_TIMEOUT_MS,
        });
        const list = response?.data?.topRated;
        setProviders(Array.isArray(list) ? list : []);
      } catch (err) {
        // Only set error for actual failures, not empty data
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          const errorMessage =
            err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : err.message;
          // Background refetch after SSR must not replace content with an error banner
          if (!silent) {
            setError(errorMessage);
          } else {
            console.warn("Home top-rated refetch failed (keeping SSR data):", err);
          }
          // Only log non-timeout errors in development (timeouts are expected when DB isn't set up)
          if (!(err instanceof FetchTimeoutError) || process.env.NODE_ENV === "production") {
            if (!silent) {
              console.error("Error loading top rated providers:", err);
            }
          }
        } else {
          // For other errors, just log and show empty state
          console.error("Error loading top rated providers:", err);
          setProviders([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (!initialHydrated) {
      void loadData(false);
      return;
    }
    if (userLocation?.latitude != null && userLocation?.longitude != null) {
      void loadData(true);
    }
  }, [
    userLocation?.latitude,
    userLocation?.longitude,
    categorySlug,
    initialHydrated,
  ]);

  const safeProviders = providers ?? [];

  if (isLoading) {
    return (
      <div className="mb-8 md:mb-12 mt-4 md:mt-8">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage="Loading top rated providers..." onRetry={handleRetry} />
        </div>
      </div>
    );
  }

  // Show empty state if no providers (whether from error or no data)
  if (safeProviders.length === 0 && !isLoading) {
    return (
      <div className="mb-8 md:mb-12 mt-4 md:mt-8">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          {error ? (
            <EmptyState
              title="Unable to load providers"
              description={error}
              action={{
                label: "Retry",
                onClick: handleRetry,
              }}
            />
          ) : (
            <EmptyState
              title="No top rated providers yet"
              description="Check back later for top rated providers"
            />
          )}
        </div>
      </div>
    );
  }

  // Don't render section if there's an error and no providers
  if (error && safeProviders.length === 0) {
    return null;
  }

  return (
    <div className="mb-8 md:mb-12 mt-4 md:mt-8">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">{LABEL_TOP_RATED}</h2>
            <Image src={Stars} alt="Stars" className="h-6 w-6 md:h-8 md:w-8 lg:h-12 lg:w-12" />
          </div>
          <Link href="/more-top-rated-cards" className="flex items-center text-xs md:text-sm font-normal underline hover:text-primary">
            {LABEL_VIEW_ALL}
            <ArrowRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
          </Link>
        </div>
        {/* Mobile: Horizontal scroll with peek effect, Desktop: Grid */}
        {/* Mobile horizontal scroll container */}
        <div className="flex md:hidden gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
          {safeProviders.slice(0, 4).map((provider, _index) => (
            <div key={provider.id} className="flex-shrink-0 w-[calc(85vw)] snap-start">
              <ProviderCard provider={provider} showTopRatedBadge={true} />
            </div>
          ))}
        </div>
        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {safeProviders.slice(0, 4).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} showTopRatedBadge={true} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TopRatedSection;
