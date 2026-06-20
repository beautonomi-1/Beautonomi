/**
 * useHomeData – parity hook for home screen.
 * Contract: /api/public/home
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import { api } from "@/lib/api-client";
import type { HomeApiResponse, PublicProviderCard } from "@/types/api";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import {
  PROVIDER_UNAVAILABLE_EVENT,
  type ProviderUnavailablePayload,
} from "@/lib/provider-availability";

/** Skip silent focus-refresh if data was fetched within this window. */
const FOCUS_REFRESH_TTL_MS = 45_000;
/** Reuse category results briefly for instant revisits; always revalidates in background. */
const HOME_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 32;

function normalizeProvider(p: Record<string, unknown>): PublicProviderCard {
  const o = p as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    slug: String(o.slug ?? o.provider_slug ?? o.id ?? ""),
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

type LoadMode = "initial" | "refresh" | "silent";

type CacheEntry = { at: number; data: HomeApiResponse };

const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<HomeApiResponse | null>>();

function buildCacheKey(lat?: number, lng?: number, category?: string): string {
  return `${lat ?? ""}|${lng ?? ""}|${category ?? "all"}`;
}

function rememberCache(key: string, data: HomeApiResponse) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const first = responseCache.keys().next().value as string | undefined;
    if (first) responseCache.delete(first);
  }
  responseCache.set(key, { at: Date.now(), data });
}

function readCache(key: string): HomeApiResponse | null {
  const hit = responseCache.get(key);
  if (!hit || Date.now() - hit.at >= HOME_CACHE_TTL_MS) return null;
  return hit.data;
}

async function fetchHome(
  lat?: number,
  lng?: number,
  category?: string,
): Promise<HomeApiResponse | null> {
  const params = new URLSearchParams();
  if (lat != null) params.set("lat", String(lat));
  if (lng != null) params.set("lng", String(lng));
  if (category && category !== "All") params.set("category", category);
  const qs = params.toString();
  const res = await api.get<unknown>(`/api/public/home${qs ? `?${qs}` : ""}`);
  if (res.error) {
    throw new Error(res.error.message);
  }
  return normalize(res.data ?? {});
}

export function useHomeData(lat?: number, lng?: number, category?: string) {
  const [data, setData] = useState<HomeApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSuccessRef = useRef<number>(0);
  const requestIdRef = useRef(0);
  // Distinguishes the very first mount (full-screen skeleton) from later
  // category switches (feed-only skeleton that keeps the header/category bar).
  const hasLoadedOnceRef = useRef(false);

  const load = useCallback(
    async (mode: LoadMode = "initial", options?: { forceFresh?: boolean }) => {
      const cacheKey = buildCacheKey(lat, lng, category);
      const forceFresh = options?.forceFresh === true || mode === "refresh";
      const requestId = ++requestIdRef.current;
      const isFirstLoad = !hasLoadedOnceRef.current;

      if (mode === "initial" && !forceFresh) {
        const cached = readCache(cacheKey);
        if (cached) {
          setData(cached);
          setLoading(false);
          setFeedLoading(false);
          setError(null);
          hasLoadedOnceRef.current = true;
          void load("silent", { forceFresh: true });
          return;
        }
        // Category switch after the first load: clear the previous category's
        // providers and show a feed-only skeleton (header stays mounted).
        if (!isFirstLoad) {
          setData(null);
          setFeedLoading(true);
        }
      }

      if (mode === "refresh") setRefreshing(true);
      else if (mode === "initial" && isFirstLoad) setLoading(true);
      setError(null);

      const runFetch = async (): Promise<HomeApiResponse | null> => {
        const existing = inflightRequests.get(cacheKey);
        if (existing && !forceFresh) return existing;

        const promise = fetchHome(lat, lng, category)
          .then((normalized) => {
            if (normalized) rememberCache(cacheKey, normalized);
            return normalized;
          })
          .finally(() => {
            inflightRequests.delete(cacheKey);
          });

        if (!forceFresh) {
          inflightRequests.set(cacheKey, promise);
        }
        return promise;
      };

      try {
        const normalized = await runFetch();
        if (requestId !== requestIdRef.current) return;

        if (normalized) {
          setData(normalized);
          lastSuccessRef.current = Date.now();
          hasLoadedOnceRef.current = true;
        }
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : "Could not load home feed");
      } finally {
        if (requestId !== requestIdRef.current) return;
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "initial") setLoading(false);
        setFeedLoading(false);
      }
    },
    [lat, lng, category],
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  // Self-heal when a provider becomes unavailable elsewhere (e.g. the user
  // tapped a now-deleted provider): drop it from the visible feed immediately
  // and clear the home cache so a revisit within the TTL window can't restore it.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      PROVIDER_UNAVAILABLE_EVENT,
      (payload: ProviderUnavailablePayload) => {
        const targets = new Set(
          [payload?.providerId, payload?.slug]
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter((v) => v.length > 0),
        );
        if (targets.size === 0) return;
        responseCache.clear();
        setData((prev) => {
          if (!prev) return prev;
          const keep = (p: PublicProviderCard) => !targets.has(p.id) && !targets.has(p.slug);
          return {
            ...prev,
            topRated: prev.topRated.filter(keep),
            sponsored: prev.sponsored?.filter(keep),
            nearest: prev.nearest.filter(keep),
            hottest: prev.hottest.filter(keep),
            upcoming: prev.upcoming.filter(keep),
          };
        });
      },
    );
    return () => sub.remove();
  }, []);

  /** Explicit pull-to-refresh – shows the spinner and bypasses cache. */
  const refetch = useCallback(() => load("refresh", { forceFresh: true }), [load]);

  /**
   * Focus-triggered background refresh.
   * Skipped when data was successfully fetched within the TTL window so that
   * returning to the Home tab doesn't reset scroll position or re-animate.
   */
  const silentRefetch = useCallback(() => {
    if (Date.now() - lastSuccessRef.current < FOCUS_REFRESH_TTL_MS) return;
    load("silent", { forceFresh: true });
  }, [load]);

  return { data, loading, feedLoading, refreshing, error, refetch, silentRefetch };
}
