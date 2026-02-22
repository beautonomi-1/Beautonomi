"use client";
import React, { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card";
import { useUserLocation } from "@/hooks/useUserLocation";

const NearestProvidersSection = () => {
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start false to render immediately
  const [error, setError] = useState<string | null>(null);
  const { location: userLocation, isLoading: locationLoading } = useUserLocation();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Get user location from localStorage (set by header, including IP-based location)
        let lat: number | null = null;
        let lng: number | null = null;
        let city: string | null = null;
        let country: string | null = null;

        // Use location from useUserLocation hook (includes IP-based location)
        if (userLocation) {
          lat = userLocation.latitude;
          lng = userLocation.longitude;
          // Try to extract city and country from address string
          const addressParts = userLocation.address.split(",").map(s => s.trim());
          if (addressParts.length > 1) {
            city = addressParts[0];
            country = addressParts[addressParts.length - 1];
          }
        } else if (!locationLoading) {
          // If no location from hook and not loading, try browser geolocation as fallback
          if (navigator.geolocation) {
            try {
              const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
              });
              lat = position.coords.latitude;
              lng = position.coords.longitude;
            } catch {
              // Geolocation failed, continue without it
              console.log("Geolocation not available or denied");
            }
          }
        }

        // Build query params
        const params = new URLSearchParams();
        if (lat && lng) {
          params.set("lat", lat.toString());
          params.set("lng", lng.toString());
        }
        if (city) params.set("city", city);
        if (country) params.set("country", country || "ZA");

        const response = await fetcher.get<{
          data: { nearest: PublicProviderCard[] };
          error: null;
        }>(`/api/public/home?${params.toString()}`, { timeoutMs: 10000 });
        setProviders(response.data.nearest || []);
      } catch (err) {
        // Only set error for actual failures, not empty data
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          const errorMessage =
            err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : err.message;
          setError(errorMessage);
          console.error("Error loading nearest providers:", err);
        } else {
          // For other errors, just log and show empty state
          console.error("Error loading nearest providers:", err);
          setProviders([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Wait for location to load before fetching providers
    if (!locationLoading) {
      loadData();
    }
  }, [userLocation, locationLoading]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="mb-8 md:mb-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage="Loading nearest providers..." onRetry={handleRetry} />
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
              title="No nearby providers"
              description="We couldn't find providers near you. Try searching by city."
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
            <MapPin className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">Nearest Providers</h2>
          </div>
          <Link href="/more-nearest-providers-cards" className="flex items-center text-xs md:text-sm font-normal underline hover:text-[#FF0077]">
            View More
            <ArrowRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
          </Link>
        </div>
        {/* Mobile: Horizontal scroll with peek effect, Desktop: Grid */}
        {/* Mobile horizontal scroll container */}
        <div className="flex md:hidden gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
          {providers.slice(0, 4).map((provider, _index) => (
            <div key={provider.id} className="flex-shrink-0 w-[calc(85vw)] snap-start">
              <ProviderCard provider={provider} showNearestBadge={true} />
            </div>
          ))}
        </div>
        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {providers.slice(0, 4).map((provider) => (
            <ProviderCard key={provider.id} provider={provider} showNearestBadge={true} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default NearestProvidersSection;
