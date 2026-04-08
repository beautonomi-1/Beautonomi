"use client";
import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card-dynamic";
import { useUserLocation } from "@/hooks/useUserLocation";
import { fetchPublicHomeClient } from "@/app/home/fetch-public-home-client";
import { cn } from "@/lib/utils";

type UpcomingTalentSectionProps = {
  categorySlug?: string;
  initialProviders?: PublicProviderCard[];
  initialHydrated?: boolean;
};

const UpcomingTalentSection = ({
  categorySlug = "all",
  initialProviders,
  initialHydrated = false,
}: UpcomingTalentSectionProps) => {
  const [providers, setProviders] = useState<PublicProviderCard[]>(() =>
    initialHydrated ? (initialProviders ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(() => !initialHydrated);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { location: userLocation } = useUserLocation();
  const prevInitialProvidersRef = useRef(initialProviders);

  useEffect(() => {
    if (!initialHydrated) return;
    if (prevInitialProvidersRef.current === initialProviders) return;
    prevInitialProvidersRef.current = initialProviders;
    setProviders(initialProviders ?? []);
  }, [initialHydrated, initialProviders]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      const silent = providers.length > 0;
      try {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);
        setError(null);
        const params = new URLSearchParams();
        if (userLocation?.latitude != null && userLocation?.longitude != null) {
          params.set("lat", String(userLocation.latitude));
          params.set("lng", String(userLocation.longitude));
        }
        if (categorySlug && categorySlug !== "all") {
          params.set("category", categorySlug);
        }
        const response = await fetchPublicHomeClient(params);
        if (cancelled) return;
        setProviders(response.data?.upcoming ?? []);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          const errorMessage =
            err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : err.message;
          if (!silent) {
            setError(errorMessage);
          } else {
            console.warn("Home upcoming refetch failed (keeping previous data):", err);
          }
          if (!silent) {
            console.error("Error loading rising stars:", err);
          }
        } else {
          console.error("Error loading rising stars:", err);
          if (!silent) setProviders([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation?.latitude, userLocation?.longitude, categorySlug]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="mb-8 md:mb-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage="Loading rising stars..." onRetry={handleRetry} />
        </div>
      </div>
    );
  }

  // Show empty state if no providers (whether from error or no data)
  if (providers.length === 0 && !isLoading) {
    return (
      <div className="mb-8 md:mb-12">
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
              title="No new providers yet"
              description="Check back later for rising stars"
            />
          )}
        </div>
      </div>
    );
  }

  // Don't render section if there's an error and no providers
  if (error && providers.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "mb-8 md:mb-12",
        isRefreshing && "opacity-60 transition-opacity duration-150",
      )}
      aria-busy={isRefreshing}
    >
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">Rising Star</h2>
          </div>
          <Link href="/more-rising-star-cards" className="flex items-center text-xs md:text-sm font-normal underline hover:text-primary">
            View More
            <ArrowRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
          </Link>
        </div>
        {/* Mobile: Horizontal scroll with peek effect, Desktop: Grid */}
        {/* Mobile horizontal scroll container */}
        <div className="flex md:hidden gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
          {providers.slice(0, 4).map((provider, _index) => (
            <div key={provider.id} className="flex-shrink-0 w-[calc(85vw)] snap-start">
              <ProviderCard provider={provider} showUpcomingTalentBadge={true} />
            </div>
          ))}
        </div>
        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {providers.slice(0, 4).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} showUpcomingTalentBadge={true} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default UpcomingTalentSection;
