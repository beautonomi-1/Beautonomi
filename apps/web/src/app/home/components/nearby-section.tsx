"use client"
import React, { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import LandingServiceCard from "./landing-service-card";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import { useUserLocation } from "@/hooks/useUserLocation";

const NearbySection = () => {
  const [providers, setProviders] = useState<PublicProviderCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getLocationParams, hasLocation } = useUserLocation();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Get location params if available
        const locationParams = getLocationParams();
        const queryString = hasLocation 
          ? `?${new URLSearchParams(locationParams).toString()}`
          : "";
        
        const response = await fetcher.get<{
          data: { nearest: PublicProviderCard[] };
          error: null;
        }>(`/api/public/home${queryString}`);
        setProviders(response.data.nearest || []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load nearby providers";
        setError(errorMessage);
        console.error("Error loading nearby providers:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [getLocationParams, hasLocation]);

  if (isLoading) {
    return (
      <div className="mb-8 md:mb-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <LoadingTimeout loadingMessage="Loading nearby providers..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-8 md:mb-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <EmptyState
            title="Failed to load providers"
            description={error}
          />
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="mb-8 md:mb-12">
        <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
          <EmptyState
            title="No nearby providers"
            description="Check back later for providers near you"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 md:mb-12">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">Nearby</h2>
          </div>
          <Link href="/more-nearest-providers-cards" className="flex items-center text-xs md:text-sm font-normal underline hover:text-[#FF0077]">
            View More
            <ArrowRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {providers.slice(0, 4).map((provider) => (
            <LandingServiceCard 
              key={provider.id} 
              image={provider.thumbnail_url || "/images/placeholder-provider.jpg"}
              providerName={provider.business_name}
              rating={provider.rating || 0}
              reviewCount={`${provider.review_count || 0} ${provider.review_count === 1 ? "review" : "reviews"}`}
              description={`${provider.city}, ${provider.country}`}
              price=""
              distance={provider.distance_km ? `${provider.distance_km.toFixed(1)} km` : ""}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default NearbySection;
