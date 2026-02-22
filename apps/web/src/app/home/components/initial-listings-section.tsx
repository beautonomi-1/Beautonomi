"use client";
import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card";

/**
 * Initial Service Listings Section
 * 
 * Shows service provider cards immediately after category navigation
 * Based on the selected category
 */
const InitialListingsSection = () => {
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start as false so page renders immediately
  const [_error, setError] = useState<string | null>(null);
  
  // Get category from URL params, default to "all"
  const categorySlug = searchParams.get("category") || "all";

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        // Build URL with category parameter
        const url = categorySlug && categorySlug !== "all" 
          ? `/api/public/home?category=${encodeURIComponent(categorySlug)}`
          : "/api/public/home";
        
        const response = await fetcher.get<{
          data: { all: PublicProviderCard[] };
          error: null;
        }>(url, { timeoutMs: 10000 });
        setProviders(response.data.all || []);
      } catch (_err) {
        // Only set error for actual failures, not empty data
        if (_err instanceof FetchTimeoutError || _err instanceof FetchError) {
          const errorMessage =
            _err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : _err.message;
          setError(errorMessage);
          console.error("Error loading providers:", _err);
        } else {
          // For other errors, just log and show empty state
          console.error("Error loading providers:", _err);
          setProviders([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [categorySlug]);

  if (isLoading) {
    return (
      <div className="mb-8 md:mb-12 mt-4 md:mt-6">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage="Loading services..." />
        </div>
      </div>
    );
  }

  // Show empty state if no providers (whether from error or no data)
  if (providers.length === 0 && !isLoading) {
    // Don't show error state for initial listings - just return null
    return null;
  }

  return (
    <div className="mb-8 md:mb-12 mt-4 md:mt-6">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        {/* Mobile: Horizontal scroll with peek effect, Desktop: Grid */}
        {/* Mobile horizontal scroll container */}
        <div className="flex md:hidden gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
          {providers.slice(0, 4).map((provider, _index) => (
            <div key={provider.id} className="flex-shrink-0 w-[calc(85vw)] snap-start">
              <ProviderCard provider={provider} />
            </div>
          ))}
        </div>
        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {providers.slice(0, 4).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default InitialListingsSection;
