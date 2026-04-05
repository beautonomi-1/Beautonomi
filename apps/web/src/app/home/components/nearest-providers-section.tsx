"use client";
import React, { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { PublicProviderCard } from "@/types/beautonomi";
import ProviderCard from "./provider-card-dynamic";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PUBLIC_HOME_CLIENT_TIMEOUT_MS } from "@/app/home/home-public-api";

type NearestProvidersSectionProps = {
  categorySlug?: string;
  initialProviders?: PublicProviderCard[];
  initialHydrated?: boolean;
};

const NearestProvidersSection = ({
  categorySlug = "all",
  initialProviders,
  initialHydrated = false,
}: NearestProvidersSectionProps) => {
  const [providers, setProviders] = useState<PublicProviderCard[]>(() =>
    initialHydrated ? (initialProviders ?? []) : [],
  );
  const [isLoading, setIsLoading] = useState(() => !initialHydrated);
  const [error, setError] = useState<string | null>(null);
  const { location: userLocation, isLoading: locationLoading } = useUserLocation();
  const distanceConfig = useModuleConfig("distance") as { enabled?: boolean; default_radius_km?: number; max_radius_km?: number; step_km?: number } | undefined;
  const distanceFilterEnabled = useFeatureFlag("distance.filter.enabled");
  const useRadius = Boolean(distanceConfig?.enabled) || distanceFilterEnabled;
  const maxRadius = distanceConfig?.max_radius_km ?? 50;
  /** "all" = no distance filter (country-wide / tenant-wide); numeric = filter nearest list */
  const [radiusKm, setRadiusKm] = useState<number | "all">("all");

  useEffect(() => {
    const loadData = async (silent: boolean) => {
      try {
        if (!silent) setIsLoading(true);
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
          const addressParts = userLocation.address.split(",").map((s) => s.trim());
          if (addressParts.length > 1) {
            city = addressParts[0];
            country = addressParts[addressParts.length - 1];
          }
        } else if (!locationLoading) {
          // If no location from hook and not loading, try browser geolocation as fallback.
          // Note: The browser may use Google's network location service; a 403 in the console is from the browser, not our app.
          if (navigator.geolocation) {
            try {
              const perms = navigator.permissions as Permissions | undefined;
              if (perms?.query) {
                const geolocationPermission = await perms.query({ name: "geolocation" as PermissionName });
                if (geolocationPermission.state === "denied") {
                  // Skip geolocation call entirely when browser already denied; avoids repeated browser console warnings.
                  throw new Error("geolocation_permission_denied");
                }
              }
              const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
              });
              lat = position.coords.latitude;
              lng = position.coords.longitude;
            } catch {
              // Geolocation failed or denied — continue without coords (expected in many browsers)
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
        if (useRadius && radiusKm !== "all" && typeof radiusKm === "number" && radiusKm > 0) {
          params.set("radius_km", String(radiusKm));
        }
        if (categorySlug && categorySlug !== "all") {
          params.set("category", categorySlug);
        }

        const response = await fetcher.get<{
          data: { nearest: PublicProviderCard[] };
          error: null;
        }>(`/api/public/home?${params.toString()}`, {
          timeoutMs: PUBLIC_HOME_CLIENT_TIMEOUT_MS,
        });
        setProviders(response.data.nearest || []);
      } catch (err) {
        // Only set error for actual failures, not empty data
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          const errorMessage =
            err instanceof FetchTimeoutError
              ? "Request timed out. Please try again."
              : err.message;
          if (!silent) {
            setError(errorMessage);
          } else {
            console.warn("Home nearest refetch failed (keeping SSR data):", err);
          }
          if (!silent) {
            console.error("Error loading nearest providers:", err);
          }
        } else {
          // For other errors, just log and show empty state
          console.error("Error loading nearest providers:", err);
          setProviders([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Wait for location resolution before first client fetch; RSC may already seed `nearest`
    if (!locationLoading) {
      if (initialHydrated) {
        void loadData(true);
      } else {
        void loadData(false);
      }
    }
  }, [
    userLocation,
    locationLoading,
    useRadius,
    radiusKm,
    categorySlug,
    initialHydrated,
  ]);

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
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 md:h-6 md:w-6 text-gray-600" />
            <h2 className="text-xl md:text-2xl lg:text-3xl font-normal">Nearest Providers</h2>
          </div>
          <div className="flex items-center gap-2">
            {useRadius && (
              <div className="flex items-center gap-2">
                <Label htmlFor="radius-select" className="text-sm text-muted-foreground whitespace-nowrap">Within</Label>
                <Select
                  value={radiusKm === "all" ? "all" : String(radiusKm)}
                  onValueChange={(v) => setRadiusKm(v === "all" ? "all" : Number(v))}
                >
                  <SelectTrigger
                    id="radius-select"
                    className="w-[140px] rounded-full bg-gray-100 border-0 px-4 py-2 h-9 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:ring-2 focus:ring-primary/30"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Country-wide</SelectItem>
                    {[5, 10, 15, 25, 50]
                      .filter((r) => r <= maxRadius)
                      .map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {r} km
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Link href="/more-nearest-providers-cards" className="flex items-center text-xs md:text-sm font-normal underline hover:text-primary">
              View More
              <ArrowRight className="ml-1 h-3 w-3 md:h-4 md:w-4" />
            </Link>
          </div>
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
