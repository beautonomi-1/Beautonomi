"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "@/app/home/components/provider-card-dynamic";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { MapPin } from "lucide-react";

/** Convert URL slug to display name (e.g. "cape-town" -> "Cape Town") */
function slugToCityName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default function LocationPage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : null;
  const cityName = slug ? slugToCityName(slug) : "";

  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("Location is required");
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: { providers: PublicProviderCard[]; total: number };
          error: null;
        }>(`/api/public/search?city=${encodeURIComponent(cityName)}&limit=50`);
        setProviders(response.data?.providers || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
              ? err.message
              : "Failed to load providers in this area";
        setError(errorMessage);
        console.error("Error loading location providers:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [slug, cityName]);

  if (!slug) {
    return (
      <div>
        <Navbar />
        <div className="max-w-[2340px] mx-auto px-10 py-12">
          <EmptyState
            title="Location required"
            description="Please choose a location from the menu or search."
            action={{ label: "Go home", onClick: () => window.location.assign("/") }}
          />
        </div>
        <Footer />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <Navbar />
        <div className="max-w-[2340px] mx-auto px-10 py-12">
          <LoadingTimeout loadingMessage={`Loading providers in ${cityName}...`} />
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Navbar />
        <div className="max-w-[2340px] mx-auto px-10 py-12">
          <EmptyState
            title="Unable to load providers"
            description={error}
            action={{
              label: "Retry",
              onClick: () => window.location.reload(),
            }}
          />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="mb-10 mt-7">
        <div className="max-w-[2340px] mx-auto px-10">
          <div className="flex items-center gap-2 mb-5">
            <MapPin className="h-6 w-6 md:h-8 md:w-8 text-[#FF0077]" aria-hidden />
            <h1 className="text-2xl md:text-[32px] font-normal">
              Providers in {cityName}
            </h1>
          </div>
          {providers.length === 0 ? (
            <EmptyState
              title={`No providers in ${cityName} yet`}
              description="Check back later or browse other locations."
              action={{
                label: "Browse all",
                onClick: () => window.location.assign("/"),
              }}
            />
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                {providers.length} {providers.length === 1 ? "provider" : "providers"} in this area
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 gap-y-10 justify-start">
                {providers.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} />
                ))}
              </div>
            </>
          )}
          <div className="mt-8">
            <Link
              href="/"
              className="text-sm text-[#FF0077] hover:underline"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
