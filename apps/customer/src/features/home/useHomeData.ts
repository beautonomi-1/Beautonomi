/**
 * useHomeData – parity hook for home screen.
 * Contract: /api/public/home
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { HomeApiResponse, PublicProviderCard } from "@/types/api";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

function normalizeProvider(p: Record<string, unknown>): PublicProviderCard {
  const o = p as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    slug: String(o.slug ?? ""),
    business_name: String(o.business_name ?? o.businessName ?? ""),
    business_type: (o.business_type ?? o.businessType ?? "salon") as "freelancer" | "salon",
    rating: Number(o.rating ?? 0),
    review_count: Number(o.review_count ?? o.reviewCount ?? 0),
    thumbnail_url: (o.thumbnail_url ?? o.thumbnailUrl ?? null) as string | null,
    avatar_url: (o.avatar_url ?? o.avatarUrl ?? null) as string | null | undefined,
    city: String(o.city ?? ""),
    country: String(o.country ?? ""),
    is_featured: Boolean(o.is_featured ?? o.isFeatured ?? false),
    is_verified: Boolean(o.is_verified ?? o.isVerified ?? false),
    starting_price: o.starting_price != null ? Number(o.starting_price) : (o.startingPrice != null ? Number(o.startingPrice) : undefined),
    currency: String(o.currency ?? getTenantDefaultCurrency()),
    description: (o.description ?? null) as string | null | undefined,
    distance_km: o.distance_km != null ? Number(o.distance_km) : (o.distanceKm != null ? Number(o.distanceKm) : null),
    supports_house_calls: Boolean(o.supports_house_calls ?? o.supportsHouseCalls ?? false),
    supports_salon: Boolean(o.supports_salon ?? o.supportsSalon ?? true),
    current_badge: (o.current_badge as PublicProviderCard["current_badge"]) ?? null,
    is_sponsored: Boolean(o.is_sponsored ?? o.isSponsored ?? false),
    campaign_id: (o.campaign_id ?? o.campaignId ?? null) as string | null | undefined,
  };
}

function normalize(r: unknown): HomeApiResponse {
  const raw = r as Record<string, unknown>;
  const arr = (a: unknown): PublicProviderCard[] =>
    Array.isArray(a) ? a.map((x) => normalizeProvider(x as Record<string, unknown>)) : [];
  const disclosureRaw = raw.ads_disclosure_label ?? raw.adsDisclosureLabel;
  const disclosureTrimmed =
    typeof disclosureRaw === "string" ? disclosureRaw.trim() : String(disclosureRaw ?? "Sponsored").trim();

  return {
    topRated: arr(raw?.topRated ?? raw?.top_rated),
    sponsored: arr(raw?.sponsored),
    nearest: arr(raw?.nearest),
    hottest: arr(raw?.hottest),
    upcoming: arr(raw?.upcoming),
    ads_disclosure_label: disclosureTrimmed || "Sponsored",
  };
}

export function useHomeData(lat?: number, lng?: number, category?: string) {
  const [data, setData] = useState<HomeApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (lat != null) params.set("lat", String(lat));
        if (lng != null) params.set("lng", String(lng));
        if (category && category !== "All") params.set("category", category);
        const qs = params.toString();
        const res = await api.get<unknown>(`/api/public/home${qs ? `?${qs}` : ""}`);
        if (res.error) {
          setError(res.error.message);
        } else {
          try {
            setData(normalize(res.data ?? {}));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load home feed");
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load home feed");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lat, lng, category]
  );

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, refreshing, error, refetch: () => load(true) };
}
