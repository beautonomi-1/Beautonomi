"use client";
import React, { useState, useEffect } from 'react'
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import AuthGuard from "@/components/auth/auth-guard";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import ProviderCard from "@/app/home/components/provider-card";

export default function RecentlyViewedPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRecentlyViewed = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{ data: any[] }>("/api/me/recently-viewed", { cache: "no-store" });
        setProviders(response.data || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load recently viewed providers";
        setError(errorMessage);
        console.error("Error loading recently viewed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadRecentlyViewed();
  }, []);

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-10 py-4 md:py-6">
          <LoadingTimeout loadingMessage="Loading recently viewed..." />
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-10 py-4 md:py-6">
          <EmptyState
            title="Unable to load recently viewed"
            description={error}
            action={{
              label: "Try Again",
              onClick: () => window.location.reload(),
            }}
          />
        </div>
      </AuthGuard>
    );
  }
      

  return (
    <AuthGuard>
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-10 py-4 md:py-6">
        <BackButton href="/account-settings/wishlists" />
        <Breadcrumb
          items={[
            { label: "Account", href: "/account-settings" },
            { label: "Wishlists", href: "/account-settings/wishlists" },
            { label: "Recently Viewed" }
          ]}
        />
        <h2 className='text-2xl md:text-3xl font-normal mb-4 md:mb-5 text-gray-900'>Recently Viewed</h2>

        {providers.length === 0 ? (
          <EmptyState
            title="No recently viewed providers"
            description="You haven't viewed any providers recently. Start browsing to see them here."
            action={{
              label: "Browse Providers",
              onClick: () => window.location.href = "/",
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 justify-start gap-6 gap-y-10">
            {providers.map((provider, index) => (
              <ProviderCard key={provider.id || index} provider={provider} />
            ))}
          </div>
        )}
      </div>
    </AuthGuard>
  )
}
