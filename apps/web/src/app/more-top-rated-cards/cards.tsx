'use client'
import React, { useEffect, useState } from "react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "@/app/home/components/provider-card";

export default function Cards() {
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: { top_rated: PublicProviderCard[] };
          error: null;
        }>("/api/public/home");
        setProviders(response.data.top_rated || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load top rated providers";
        setError(errorMessage);
        console.error("Error loading top rated providers:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="mb-10 mt-7">
        <div className="max-w-[2340px] mx-auto px-10">
          <LoadingTimeout loadingMessage="Loading top rated providers..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-10 mt-7">
        <div className="max-w-[2340px] mx-auto px-10">
          <EmptyState
            title="Failed to load providers"
            description={error}
            action={{
              label: "Retry",
              onClick: () => window.location.reload(),
            }}
          />
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="mb-10 mt-7">
        <div className="max-w-[2340px] mx-auto px-10">
          <EmptyState
            title="No top rated providers"
            description="Check back later for top rated providers"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-10 mt-7">
      <div className="max-w-[2340px] mx-auto px-10">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-2xl md:text-[32px] font-normal">More Top Rated</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 gap-y-10 justify-start">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </div>
    </div>
  );
}
