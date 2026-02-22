"use client";
import React, { useEffect, useState } from "react";
import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card";

const HottestPicksSection = () => {
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start false to render immediately
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: { hottest: PublicProviderCard[] };
          error: null;
        }>("/api/public/home", { timeoutMs: 10000 });
        setProviders(response.data.hottest || []);
      } catch (err) {
        // Only set error for actual failures, not empty data
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          const errorMessage =
            err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : err.message;
          setError(errorMessage);
          console.error("Error loading hottest picks:", err);
        } else {
          // For other errors, just log and show empty state
          console.error("Error loading hottest picks:", err);
          setProviders([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="mb-8 md:mb-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage="Loading hottest picks..." onRetry={handleRetry} />
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
              title="No trending providers yet"
              description="Check back later for hottest picks"
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
    <div className="mb-8 md:mb-12">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <Flame className="h-6 w-6 md:h-8 md:w-8 text-orange-500" />
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">Hottest Picks</h2>
          </div>
          <Link href="/more-hottest-pick-cards" className="flex items-center text-xs md:text-sm font-normal underline hover:text-[#FF0077]">
            View More
            <ArrowRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
          </Link>
        </div>
        {/* Mobile: Horizontal scroll with peek effect, Desktop: Grid */}
        {/* Mobile horizontal scroll container */}
        <div className="flex md:hidden gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
          {providers.slice(0, 4).map((provider, _index) => (
            <div key={provider.id} className="flex-shrink-0 w-[calc(85vw)] snap-start">
              <ProviderCard provider={provider} showHottestBadge={true} />
            </div>
          ))}
        </div>
        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {providers.slice(0, 4).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} showHottestBadge={true} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default HottestPicksSection;
