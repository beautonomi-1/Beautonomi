"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { useTranslation } from "@beautonomi/i18n";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card";
import Stars from '../../../../public/images/Group 1.8f1d86be 1.svg';

const TopRatedSection = () => {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start false to render immediately
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: { topRated: PublicProviderCard[] };
          error: null;
        }>("/api/public/home", { timeoutMs: 10000 });
        setProviders(response.data.topRated || []);
      } catch (err) {
        // Only set error for actual failures, not empty data
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          const errorMessage =
            err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : err.message;
          setError(errorMessage);
          // Only log non-timeout errors in development (timeouts are expected when DB isn't set up)
          if (!(err instanceof FetchTimeoutError) || process.env.NODE_ENV === 'production') {
            console.error("Error loading top rated providers:", err);
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

    loadData();
  }, []);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    // Retry logic is handled by useEffect
    window.location.reload();
  };

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
  if (providers.length === 0 && !isLoading) {
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
  if (error && providers.length === 0) {
    return null;
  }

  return (
    <div className="mb-8 md:mb-12 mt-4 md:mt-8">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">{t("customer.topRated")}</h2>
            <Image src={Stars} alt="Stars" className="h-6 w-6 md:h-8 md:w-8 lg:h-12 lg:w-12" />
          </div>
          <Link href="/more-top-rated-cards" className="flex items-center text-xs md:text-sm font-normal underline hover:text-[#FF0077]">
            {t("common.viewAll")}
            <ArrowRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
          </Link>
        </div>
        {/* Mobile: Horizontal scroll with peek effect, Desktop: Grid */}
        {/* Mobile horizontal scroll container */}
        <div className="flex md:hidden gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
          {providers.slice(0, 4).map((provider, _index) => (
            <div key={provider.id} className="flex-shrink-0 w-[calc(85vw)] snap-start">
              <ProviderCard provider={provider} showTopRatedBadge={true} />
            </div>
          ))}
        </div>
        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {providers.slice(0, 4).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} showTopRatedBadge={true} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TopRatedSection;
