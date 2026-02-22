import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ExplorePost } from "@/types/explore";

const BUCKET = "explore-posts";

function getMediaPublicUrl(path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return path;
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Server-side fetch of published explore posts. Use for initial page load.
 */
export async function fetchExplorePosts(limit = 20): Promise<ExplorePost[]> {
  const supabase = await getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("explore_posts")
    .select(
      "id, provider_id, created_by_user_id, caption, media_urls, status, published_at, like_count, comment_count, created_at, updated_at"
    )
    .eq("status", "published")
    .eq("is_hidden", false)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error || !rows?.length) return [];

  const providerIds = [...new Set(rows.map((r: any) => r.provider_id))];
  const { data: provData } = await supabase
    .from("providers")
    .select("id, business_name, slug")
    .in("id", providerIds);
  const provMap = new Map((provData || []).map((p: any) => [p.id, p]));

  return rows.map((r: any) => {
    const p = provMap.get(r.provider_id);
    return {
      id: r.id,
      provider_id: r.provider_id,
      provider: {
        business_name: p?.business_name ?? "",
        slug: p?.slug ?? "",
      },
      created_by_user_id: r.created_by_user_id,
      caption: r.caption,
      media_urls: (r.media_urls || []).map(getMediaPublicUrl),
      status: r.status,
      published_at: r.published_at,
      like_count: r.like_count ?? 0,
      comment_count: r.comment_count ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      is_saved: false,
      is_liked: false,
    } as ExplorePost;
  });
}

/**
 * Server-side fetch of a single published explore post.
 */
export async function fetchExplorePost(id: string): Promise<ExplorePost | null> {
  const supabase = await getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("explore_posts")
    .select(
      "id, provider_id, created_by_user_id, caption, media_urls, status, published_at, like_count, comment_count, created_at, updated_at"
    )
    .eq("id", id)
    .eq("status", "published")
    .eq("is_hidden", false)
    .single();

  if (error || !row) return null;

  const { data: prov } = await supabase
    .from("providers")
    .select("id, business_name, slug")
    .eq("id", row.provider_id)
    .single();

  return {
    id: row.id,
    provider_id: row.provider_id,
    provider: {
      business_name: prov?.business_name ?? "",
      slug: prov?.slug ?? "",
    },
    created_by_user_id: row.created_by_user_id,
    caption: row.caption,
    media_urls: (row.media_urls || []).map(getMediaPublicUrl),
    status: row.status,
    published_at: row.published_at,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_saved: false,
    is_liked: false,
  } as ExplorePost;
}

/**
 * Server-side fetch of related posts (excluding given post id).
 */
export async function fetchRelatedPosts(
  excludeId: string,
  limit = 12
): Promise<ExplorePost[]> {
  const supabase = await getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("explore_posts")
    .select(
      "id, provider_id, created_by_user_id, caption, media_urls, status, published_at, like_count, comment_count, created_at, updated_at"
    )
    .eq("status", "published")
    .eq("is_hidden", false)
    .neq("id", excludeId)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error || !rows?.length) return [];

  const providerIds = [...new Set(rows.map((r: any) => r.provider_id))];
  const { data: provData } = await supabase
    .from("providers")
    .select("id, business_name, slug")
    .in("id", providerIds);
  const provMap = new Map((provData || []).map((p: any) => [p.id, p]));

  return rows.map((r: any) => {
    const p = provMap.get(r.provider_id);
    return {
      id: r.id,
      provider_id: r.provider_id,
      provider: {
        business_name: p?.business_name ?? "",
        slug: p?.slug ?? "",
      },
      created_by_user_id: r.created_by_user_id,
      caption: r.caption,
      media_urls: (r.media_urls || []).map(getMediaPublicUrl),
      status: r.status,
      published_at: r.published_at,
      like_count: r.like_count ?? 0,
      comment_count: r.comment_count ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      is_saved: false,
      is_liked: false,
    } as ExplorePost;
  });
}
