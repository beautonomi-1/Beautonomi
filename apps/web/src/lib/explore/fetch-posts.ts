import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ExplorePost } from "@/types/explore";
import { EXPLORE_POST_SELECT_WITH_PROVIDER } from "@/lib/explore/post-select";
import { mapExplorePostRow } from "@/lib/explore/post-mapper";
import { isExploreEnabled } from "@/lib/explore/explore-feature-gates";
import { enrichExplorePostsWithSoundUrls } from "@/lib/explore/sound-enrich";
import {
  buildExploreFeedFilterFingerprint,
  encodeExplorePostsCursor,
} from "@/lib/explore/explore-feed-cursor";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;

export type ExplorePostsInitial = {
  posts: ExplorePost[];
  next_cursor?: string;
  has_more: boolean;
};

/**
 * Server-side first page + cursor for infinite scroll (matches GET /api/explore/posts pagination).
 */
export async function fetchExplorePostsInitial(pageSize = 20): Promise<ExplorePostsInitial> {
  if (!(await isExploreEnabled(null))) {
    return { posts: [], has_more: false };
  }
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return { posts: [], has_more: false };
  }

  const fetchLimit = pageSize + 1;
  const { data: rows, error } = await supabase
    .from("explore_posts")
    .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
    .eq("status", "published")
    .eq("is_hidden", false)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(fetchLimit);

  if (error || !rows?.length) {
    return { posts: [], has_more: false };
  }

  const hasMore = rows.length > pageSize;
  const slice = hasMore ? rows.slice(0, pageSize) : rows;
  const last = slice[slice.length - 1];

  const mapped = slice.map((r) =>
    mapExplorePostRow(r, { supabaseUrl: supabaseUrl(), savedIds: new Set(), likedIds: new Set() }),
  );
  const posts = await enrichExplorePostsWithSoundUrls(supabase, mapped, supabaseUrl());

  const filterFp = buildExploreFeedFilterFingerprint({
    sortMode: "chronological",
    followingOnly: false,
    categorySlug: null,
    filterTags: null,
    searchQuery: null,
    lat: null,
    lng: null,
    radiusKm: 50,
    city: null,
  });
  let next_cursor: string | undefined;
  if (hasMore && last) {
    next_cursor = encodeExplorePostsCursor(
      { published_at: last.published_at, id: last.id },
      filterFp,
    );
  }

  return { posts, next_cursor, has_more: hasMore };
}

export async function fetchExplorePosts(limit = 20): Promise<ExplorePost[]> {
  const r = await fetchExplorePostsInitial(limit);
  return r.posts;
}

export async function fetchExplorePost(id: string): Promise<ExplorePost | null> {
  if (!(await isExploreEnabled(null))) {
    return null;
  }
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return null;
  }
  const { data: row, error } = await supabase
    .from("explore_posts")
    .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
    .eq("id", id)
    .eq("status", "published")
    .eq("is_hidden", false)
    .single();

  if (error || !row) return null;

  const post = mapExplorePostRow(row, { supabaseUrl: supabaseUrl(), savedIds: new Set(), likedIds: new Set() });
  const [withSound] = await enrichExplorePostsWithSoundUrls(supabase, [post], supabaseUrl());
  return withSound ?? post;
}

async function rowsToExplorePosts(
  rows: Array<Record<string, unknown>>,
): Promise<ExplorePost[]> {
  return rows.map((r) =>
    mapExplorePostRow(r as Parameters<typeof mapExplorePostRow>[0], {
      supabaseUrl: supabaseUrl(),
      savedIds: new Set(),
      likedIds: new Set(),
    }),
  );
}

export async function fetchRelatedPosts(excludeId: string, limit = 12): Promise<ExplorePost[]> {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return [];
  }

  try {
    const { data: source } = await supabase
      .from("explore_posts")
      .select("caption")
      .eq("id", excludeId)
      .maybeSingle();
    const caption = (source as { caption?: string } | null)?.caption ?? "";
    if (caption.trim()) {
      const { fetchSimilarPosts } = await import("@/lib/ai/embeddings");
      const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
      const environment =
        env === "production" ? "production" : env === "staging" ? "staging" : "development";
      const matches = await fetchSimilarPosts(excludeId, caption, limit, environment);
      if (matches.length > 0) {
        const ids = matches.map((m) => m.post_id);
        const { data: rows } = await supabase
          .from("explore_posts")
          .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
          .in("id", ids)
          .eq("status", "published")
          .eq("is_hidden", false);
        if (rows?.length) {
          const order = new Map(ids.map((id, i) => [id, i]));
          const sorted = [...rows].sort(
            (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999),
          );
          return rowsToExplorePosts(sorted.slice(0, limit) as Record<string, unknown>[]);
        }
      }
    }
  } catch {
    // fall back to recency
  }

  const { data: rows, error } = await supabase
    .from("explore_posts")
    .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
    .eq("status", "published")
    .eq("is_hidden", false)
    .neq("id", excludeId)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error || !rows?.length) return [];

  return rowsToExplorePosts(rows as Record<string, unknown>[]);
}
