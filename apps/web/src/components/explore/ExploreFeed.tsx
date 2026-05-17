"use client";

import React, { useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ExplorePostCard } from "./ExplorePostCard";
import { ExploreEmptyState } from "./ExploreEmptyState";
import { fetcher } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import type { ExplorePost } from "@/types/explore";

type SortMode = "chronological" | "trending" | "nearby" | "for_you";

interface ExploreFeedProps {
  initialPosts?: ExplorePost[];
  initialCursor?: string;
  /** When set (e.g. from SSR), avoids duplicate first page on infinite scroll */
  initialHasMore?: boolean;
  saved?: boolean;
}

export function ExploreFeed({
  initialPosts = [],
  initialCursor,
  initialHasMore,
  saved = false,
}: ExploreFeedProps) {
  const { user } = useAuth();
  const [posts, setPosts] = React.useState<ExplorePost[]>(initialPosts);
  const [cursor, setCursor] = React.useState<string | undefined>(initialCursor);
  const [hasMore, setHasMore] = React.useState(
    initialHasMore !== undefined
      ? initialHasMore
      : initialPosts.length === 0 || initialPosts.length >= 20
  );
  const [isLoading, setIsLoading] = React.useState(initialPosts.length === 0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [savedProviderIds, setSavedProviderIds] = React.useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = React.useState<SortMode>("chronological");
  const [location, setLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const prevDebouncedSearch = useRef<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!user) {
      setSavedProviderIds(new Set());
      return;
    }
    fetcher
      .get<{ data: { id: string }[] }>("/api/me/wishlists/providers", { cache: "no-store" })
      .then((res) => {
        const data = (res as any)?.data ?? res;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setSavedProviderIds(new Set(list.map((p: { id: string }) => p.id)));
      })
      .catch(() => setSavedProviderIds(new Set()));
  }, [user]);

  const endpoint = saved ? "/api/explore/saved" : "/api/explore/posts";

  const buildParams = useCallback(
    (includeCursor: boolean, overrideSort?: SortMode, overrideLoc?: { lat: number; lng: number } | null) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (includeCursor && cursor) params.set("cursor", cursor);
      if (!saved) {
        const sort = overrideSort ?? sortMode;
        const loc = overrideLoc !== undefined ? overrideLoc : location;
        if (sort === "trending") params.set("sort", "trending");
        if (sort === "for_you") params.set("sort", "for_you");
        if (sort === "nearby" && loc) {
          params.set("sort", "nearby");
          params.set("lat", String(loc.lat));
          params.set("lng", String(loc.lng));
          params.set("radius_km", "50");
        }
        if (debouncedSearch) params.set("search", debouncedSearch);
      }
      return params;
    },
    [cursor, saved, sortMode, location, debouncedSearch]
  );

  const loadMore = useCallback(
    async (forceRetry = false, overrideSort?: SortMode, overrideLoc?: { lat: number; lng: number } | null) => {
      if (!forceRetry && (isLoading || !hasMore)) return;
      setIsLoading(true);
      try {
        const params = buildParams(!forceRetry, overrideSort, overrideLoc);
        const res = await fetcher.get<{
          data: { data: ExplorePost[]; next_cursor?: string; has_more: boolean };
        }>(`${endpoint}?${params}`);
        const body = (res as any)?.data ?? res;
        const items = Array.isArray(body) ? body : body?.data ?? [];
        const nextCursor = body?.next_cursor;
        const more = body?.has_more ?? false;
        if (forceRetry) {
          setPosts(items);
        } else {
          setPosts((p) => {
            const ids = new Set(p.map((x) => x.id));
            const newItems = items.filter((x) => !ids.has(x.id));
            return newItems.length ? [...p, ...newItems] : p;
          });
        }
        setCursor(nextCursor);
        setHasMore(more);
        setLoadError(null);
      } catch (err) {
        setHasMore(false);
        setLoadError(err instanceof Error ? err.message : "Failed to load posts");
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint, buildParams, hasMore, isLoading]
  );

  const refetchWithSort = useCallback(
    (mode: SortMode) => {
      setSortMode(mode);
      if (mode !== "nearby") setLocation(null);
      setPosts([]);
      setCursor(undefined);
      setHasMore(true);
      setLoadError(null);
      initialLoadDone.current = true;
      loadMoreRefFn.current(true, mode, mode === "nearby" ? location : null);
    },
    [location]
  );

  const fetchWithLocation = useCallback(
    (lat: number, lng: number) => {
      setLocation({ lat, lng });
      setSortMode("nearby");
      setPosts([]);
      setCursor(undefined);
      setHasMore(true);
      setLoadError(null);
      setIsLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("sort", "nearby");
      params.set("lat", String(lat));
      params.set("lng", String(lng));
      params.set("radius_km", "50");
      if (debouncedSearch) params.set("search", debouncedSearch);
      fetcher
        .get<{ data: ExplorePost[]; next_cursor?: string; has_more: boolean }>(
          `/api/explore/posts?${params}`
        )
        .then((res) => {
          const body = (res as any)?.data ?? res;
          const items = Array.isArray(body) ? body : body?.data ?? [];
          setPosts(items);
          setCursor(body?.next_cursor);
          setHasMore(body?.has_more ?? false);
        })
        .catch((err) => {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
          setHasMore(false);
        })
        .finally(() => {
          setIsLoading(false);
          setLocationLoading(false);
        });
    },
    [debouncedSearch]
  );

  const handleNearMe = useCallback(() => {
    if (sortMode === "nearby" && location) return;
    setLocationLoading(true);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWithLocation(pos.coords.latitude, pos.coords.longitude),
        () => {
          fetcher
            .get<{ data: { latitude?: number; longitude?: number } }>("/api/public/ip-geolocation")
            .then((res) => {
              const d = (res as any)?.data ?? res?.data;
              const lat = d?.latitude;
              const lng = d?.longitude;
              if (lat != null && lng != null) fetchWithLocation(Number(lat), Number(lng));
              else setLocationLoading(false);
            })
            .catch(() => setLocationLoading(false));
        }
      );
    } else {
      fetcher
        .get<{ data: { latitude?: number; longitude?: number } }>("/api/public/ip-geolocation")
        .then((res) => {
          const d = (res as any)?.data ?? res?.data;
          const lat = d?.latitude;
          const lng = d?.longitude;
          if (lat != null && lng != null) fetchWithLocation(Number(lat), Number(lng));
          else setLocationLoading(false);
        })
        .catch(() => setLocationLoading(false));
    }
  }, [sortMode, location, fetchWithLocation]);

  const loadMoreRefFn = useRef(loadMore);
  loadMoreRefFn.current = loadMore;

  const handleSaveProviderChange = useCallback((providerId: string, inWishlist: boolean) => {
    setSavedProviderIds((prev) => {
      const next = new Set(prev);
      if (inWishlist) next.add(providerId);
      else next.delete(providerId);
      return next;
    });
  }, []);

  const onSortChip = useCallback(
    (mode: SortMode) => {
      if (mode === "nearby") {
        handleNearMe();
        return;
      }
      if (mode === "for_you" && !user) return; // For You requires auth
      if (sortMode === mode) return;
      refetchWithSort(mode);
    },
    [sortMode, handleNearMe, refetchWithSort, user]
  );

  useEffect(() => {
    if (initialPosts.length === 0 && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadMoreRefFn.current(true);
    }
  }, []);

  useEffect(() => {
    if (saved) return;
    if (prevDebouncedSearch.current === null) {
      prevDebouncedSearch.current = debouncedSearch;
      return;
    }
    if (prevDebouncedSearch.current === debouncedSearch) return;
    prevDebouncedSearch.current = debouncedSearch;
    setPosts([]);
    setCursor(undefined);
    setHasMore(true);
    setLoadError(null);
    initialLoadDone.current = true;
    loadMoreRefFn.current(true);
  }, [debouncedSearch, saved]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  if (posts.length === 0 && !isLoading) {
    if (loadError) {
      return (
        <div className="py-12 text-center">
          <p className="text-gray-600 mb-2">Could not load explore feed</p>
          <p className="text-sm text-gray-500 mb-4">{loadError}</p>
          <button
            onClick={() => {
              setLoadError(null);
              setHasMore(true);
              setCursor(undefined);
              setPosts([]);
              loadMore(true);
            }}
            className="text-[#FF0077] hover:underline text-sm font-medium"
          >
            Try again
          </button>
        </div>
      );
    }
    return <ExploreEmptyState saved={saved} />;
  }

  // Initial load: show skeleton grid so user sees something is loading
  if (posts.length === 0 && isLoading) {
    return (
      <div className="pb-8">
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="break-inside-avoid mb-4">
              <div className="bg-gray-100 rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-[4/5] w-full" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {!saved && (
        <div className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Explore</h1>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/explore/saved"
                className="text-sm font-semibold text-gray-700 hover:text-[#FF0077] whitespace-nowrap"
              >
                Saved
              </Link>
            </div>
          </div>
          <label className="block text-sm font-medium text-gray-600 mb-2 sr-only" htmlFor="explore-search">
            Search inspiration
          </label>
          <input
            id="explore-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search looks, styles, treatments…"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[#FF0077] focus:outline-none focus:ring-2 focus:ring-pink-100 mb-4"
            autoComplete="off"
          />
        </div>
      )}
      {!saved && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => onSortChip("chronological")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sortMode === "chronological"
                ? "bg-[#FF0077] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Latest
          </button>
          <button
            type="button"
            onClick={() => onSortChip("trending")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sortMode === "trending"
                ? "bg-[#FF0077] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Trending
          </button>
          <button
            type="button"
            onClick={() => onSortChip("nearby")}
            disabled={locationLoading}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sortMode === "nearby"
                ? "bg-[#FF0077] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            } disabled:opacity-60`}
          >
            {locationLoading ? "Getting location…" : "Near me"}
          </button>
          {user && (
            <button
              type="button"
              onClick={() => onSortChip("for_you")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                sortMode === "for_you"
                  ? "bg-[#FF0077] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              For You
            </button>
          )}
        </div>
      )}
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
        {posts.map((post, i) => (
          <div key={post.id} className="break-inside-avoid mb-4">
            <ExplorePostCard
              post={post}
              priority={i < 4}
              isProviderInWishlist={savedProviderIds.has(post.provider_id)}
              onSaveProviderChange={handleSaveProviderChange}
            />
          </div>
        ))}
      </div>
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {isLoading && (
            <div className="animate-spin w-8 h-8 border-2 border-[#FF0077] border-t-transparent rounded-full" />
          )}
        </div>
      )}
    </div>
  );
}
