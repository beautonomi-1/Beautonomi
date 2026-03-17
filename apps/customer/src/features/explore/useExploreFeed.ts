/**
 * useExploreFeed – parity hook for explore feed.
 * Contract: /api/explore/posts
 *
 * Supports server-side filtering by category, search, tags, and sort mode.
 */
import { useState, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import type { ExplorePost } from "@/types/api";

interface ExploreFeedResponse {
  data?: ExplorePost[];
  posts?: ExplorePost[];
  next_cursor?: string;
  has_more?: boolean;
}

export interface ExploreFeedFilters {
  category?: string | null;
  search?: string | null;
  tags?: string[] | null;
  sort?: "chronological" | "trending" | "nearby" | "for_you";
  lat?: number | null;
  lng?: number | null;
  radius_km?: number;
}

export function useExploreFeed() {
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const filtersRef = useRef<ExploreFeedFilters>({});
  const initialLoadDone = useRef(false);

  const load = useCallback(
    async (opts?: { refresh?: boolean; append?: boolean; filters?: ExploreFeedFilters }) => {
      const isRefresh = opts?.refresh === true;
      const isAppend = opts?.append === true;
      const newFilters = opts?.filters;

      if (newFilters !== undefined) {
        filtersRef.current = newFilters;
      }

      if (isRefresh) {
        setRefreshing(true);
        setNextCursor(undefined);
        setHasMore(true);
      } else if (isAppend) {
        setLoadingMore(true);
      } else if (initialLoadDone.current && !newFilters) {
        return;
      } else {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", "20");
      if (isAppend && nextCursor) params.set("cursor", nextCursor);

      const f = filtersRef.current;
      if (f.category && f.category !== "all") params.set("category", f.category);
      if (f.search) params.set("search", f.search);
      if (f.tags && f.tags.length > 0) params.set("tags", f.tags.join(","));
      if (f.sort === "trending") params.set("sort", "trending");
      if (f.sort === "for_you") params.set("sort", "for_you");
      if (f.sort === "nearby" && f.lat != null && f.lng != null) {
        params.set("sort", "nearby");
        params.set("lat", String(f.lat));
        params.set("lng", String(f.lng));
        params.set("radius_km", String(f.radius_km ?? 50));
      }

      const res = await api.get<ExploreFeedResponse | ExplorePost[]>(
        `/api/explore/posts?${params.toString()}`
      );

      if (res.error) {
        setError(res.error.message);
        if (isRefresh || newFilters) setPosts([]);
      } else {
        const body = res.data as ExploreFeedResponse | ExplorePost[] | undefined;
        let items: ExplorePost[] = [];
        let nc: string | undefined;
        let more = false;

        if (Array.isArray(body)) {
          items = body;
        } else if (body) {
          items = body.data ?? body.posts ?? [];
          nc = body.next_cursor;
          more = body.has_more ?? false;
        }

        if (isRefresh || !isAppend) {
          setPosts(items);
        } else {
          setPosts((prev) => {
            const ids = new Set(prev.map((x) => x.id));
            const newItems = items.filter((x) => !ids.has(x.id));
            return newItems.length ? [...prev, ...newItems] : prev;
          });
        }
        setNextCursor(nc);
        setHasMore(more);
      }

      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      initialLoadDone.current = true;
    },
    [nextCursor]
  );

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore && posts.length > 0) {
      load({ append: true });
    }
  }, [hasMore, loadingMore, posts.length, load]);

  const applyFilters = useCallback(
    (filters: ExploreFeedFilters) => {
      load({ refresh: true, filters });
    },
    [load],
  );

  const setPostSaved = useCallback((postId: string, is_saved: boolean) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, is_saved } : p))
    );
  }, []);

  return {
    posts,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    refetch: () => load({ refresh: true }),
    loadMore,
    initialLoad: () => load({}),
    applyFilters,
    setPostSaved,
  };
}
