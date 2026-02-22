"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { ExplorePostCard } from "./ExplorePostCard";
import { ExploreEmptyState } from "./ExploreEmptyState";
import { fetcher } from "@/lib/http/fetcher";
import type { ExplorePost } from "@/types/explore";

interface ExploreFeedProps {
  initialPosts?: ExplorePost[];
  initialCursor?: string;
  saved?: boolean;
}

export function ExploreFeed({
  initialPosts = [],
  initialCursor,
  saved = false,
}: ExploreFeedProps) {
  const [posts, setPosts] = React.useState<ExplorePost[]>(initialPosts);
  const [cursor, setCursor] = React.useState<string | undefined>(initialCursor);
  const [hasMore, setHasMore] = React.useState(
    initialPosts.length === 0 || initialPosts.length >= 20
  );
  const [isLoading, setIsLoading] = React.useState(initialPosts.length === 0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const initialLoadDone = useRef(false);

  const endpoint = saved ? "/api/explore/saved" : "/api/explore/posts";

  const loadMore = useCallback(async (forceRetry = false) => {
    if (!forceRetry && (isLoading || !hasMore)) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (!forceRetry && cursor) params.set("cursor", cursor);
      const res = await fetcher.get<{
        data: { data: ExplorePost[]; next_cursor?: string; has_more: boolean };
      }>(`${endpoint}?${params}`);
      const body = (res as any)?.data ?? res;
      const items = Array.isArray(body) ? body : body?.data ?? [];
      const nextCursor = body?.next_cursor;
      const more = body?.has_more ?? false;
      setPosts((p) => {
        const ids = new Set(p.map((x) => x.id));
        const newItems = items.filter((x) => !ids.has(x.id));
        return newItems.length ? [...p, ...newItems] : p;
      });
      setCursor(nextCursor);
      setHasMore(more);
      setLoadError(null);
    } catch (err) {
      setHasMore(false);
      setLoadError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setIsLoading(false);
    }
  }, [cursor, hasMore, isLoading, endpoint]);

  const loadMoreRefFn = useRef(loadMore);
  loadMoreRefFn.current = loadMore;

  useEffect(() => {
    if (initialPosts.length === 0 && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadMoreRefFn.current(true);
    }
  }, []);

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
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-4">
        {posts.map((post, i) => (
          <div key={post.id} className="break-inside-avoid mb-4">
            <ExplorePostCard post={post} priority={i < 4} />
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
