"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect, useRef } from "react";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import ProviderCard from "@/app/home/components/provider-card-dynamic";
import type { PublicProviderCard } from "@/types/beautonomi";
import type { RecentlyViewedProviderRow } from "./fetch-recently-viewed-initial";

type RecentlyViewedProvider = RecentlyViewedProviderRow;

export default function WishlistsRecentlyViewedPageClient({
  initialProviders,
}: {
  initialProviders: RecentlyViewedProvider[] | null;
}) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<RecentlyViewedProvider[]>(() => initialProviders ?? []);
  const [isLoading, setIsLoading] = useState(() => initialProviders === null);
  const [error, setError] = useState<string | null>(null);
  const skipHydrateLoadOnce = useRef(initialProviders !== null);

  useEffect(() => {
    const loadRecentlyViewed = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{ data: RecentlyViewedProvider[] }>("/api/me/recently-viewed", { cache: "no-store" });
        setProviders(response.data || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? t("web.accountSettings.wishlists.requestTimeout")
            : err instanceof FetchError
              ? err.message
              : t("web.accountSettings.wishlists.loadRecentlyViewedFailed");
        setError(errorMessage);
        console.error("Error loading recently viewed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (skipHydrateLoadOnce.current) {
      skipHydrateLoadOnce.current = false;
      setIsLoading(false);
      return;
    }
    void loadRecentlyViewed();
  }, []);

  if (isLoading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-10 py-4 md:py-6">
          <LoadingTimeout loadingMessage={t("web.accountSettings.wishlists.loadingRecentlyViewed")} />
        </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-10 py-4 md:py-6">
          <EmptyState
            title={t("web.accountSettings.unableLoadRecentlyViewed")}
            description={error}
            action={{
              label: t("web.accountSettings.wishlists.tryAgain"),
              onClick: () => window.location.reload(),
            }}
          />
        </div>
    );
  }
      

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-10 py-4 md:py-6">
        <BackButton href="/account-settings/wishlists" />
        <Breadcrumb
          items={[
            { label: t("web.accountSettings.wishlists.account"), href: "/account-settings" },
            { label: t("web.accountSettings.wishlists.title"), href: "/account-settings/wishlists" },
            { label: t("web.accountSettings.wishlists.recentlyViewedTitle") }
          ]}
        />
        <h2 className='text-2xl md:text-3xl font-normal mb-4 md:mb-5 text-gray-900'>{t("web.accountSettings.wishlists.recentlyViewedTitle")}</h2>

        {providers.length === 0 ? (
          <EmptyState
            title={t("web.accountSettings.noRecentlyViewed")}
            description={t("web.accountSettings.wishlists.emptyRecentlyViewedDesc")}
            action={{
              label: t("web.accountSettings.wishlists.browseProviders"),
              onClick: () => window.location.href = "/",
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 justify-start gap-6 gap-y-10">
            {providers.map((provider, index) => (
              <ProviderCard key={provider.id || index} provider={provider as unknown as PublicProviderCard} />
            ))}
          </div>
        )}
      </div>
  )
}
