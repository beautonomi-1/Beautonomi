import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAuthInApi } from "@/lib/supabase/api-helpers";
import { requireSocialAccess } from "@/lib/safety/require-social-access";
import type { ExplorePost } from "@/types/explore";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

/**
 * GET /api/explore/collections/[id]
 * Get one collection with its posts. Auth required; must own the collection.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: collection, error: collError } = await supabaseAdmin
      .from("explore_collections")
      .select("id, user_id, name, slug, created_at, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (collError || !collection) {
      return errorResponse("Collection not found", "NOT_FOUND", 404);
    }

    const { data: linkRows } = await supabaseAdmin
      .from("explore_collection_posts")
      .select("post_id")
      .eq("collection_id", id)
      .order("created_at", { ascending: false });

    const postIds = (linkRows || []).map((r: any) => r.post_id);
    if (postIds.length === 0) {
      return successResponse({
        ...collection,
        post_count: 0,
        posts: [],
      });
    }

    const { data: postRows } = await supabaseAdmin
      .from("explore_posts")
      .select("id, provider_id, created_by_user_id, caption, media_urls, status, published_at, like_count, comment_count, tags, primary_category_id, offering_id, created_at, updated_at")
      .in("id", postIds)
      .eq("status", "published")
      .eq("is_hidden", false);

    const order = postIds;
    const postMap = new Map((postRows || []).map((p: any) => [p.id, p]));
    const providerIds = [...new Set((postRows || []).map((p: any) => p.provider_id))];
    const { data: provData } = await supabaseAdmin
      .from("providers")
      .select("id, business_name, slug")
      .in("id", providerIds);
    const provMap = new Map((provData || []).map((p: any) => [p.id, p]));
    const offeringIds = [...new Set((postRows || []).map((p: any) => p.offering_id).filter(Boolean))];
    const offeringMap = new Map<string, { id: string; name: string; price?: number; duration_minutes?: number }>();
    if (offeringIds.length > 0) {
      const { data: offData } = await supabaseAdmin
        .from("offerings")
        .select("id, title, price, duration_minutes")
        .in("id", offeringIds);
      (offData || []).forEach((o: any) =>
        offeringMap.set(o.id, { id: o.id, name: o.title ?? "", price: o.price != null ? Number(o.price) : undefined, duration_minutes: o.duration_minutes ?? undefined })
      );
    }
    const likedRes = await supabaseAdmin
      .from("explore_events")
      .select("post_id")
      .eq("actor_type", "authed")
      .eq("actor_key", user.id)
      .eq("event_type", "like")
      .in("post_id", postIds);
    const likedIds = new Set((likedRes.data || []).map((r: any) => r.post_id));

    const posts: ExplorePost[] = order
      .map((postId) => {
        const row = postMap.get(postId);
        if (!row) return null;
        const p = provMap.get(row.provider_id);
        const offering = row.offering_id ? offeringMap.get(row.offering_id) : null;
        return {
          id: row.id,
          provider_id: row.provider_id,
          provider: p ? { business_name: p.business_name, slug: p.slug } : { business_name: "", slug: "" },
          created_by_user_id: row.created_by_user_id,
          caption: row.caption,
          media_urls: (row.media_urls || []).map((u: string) => toPublicMediaUrl(u, process.env.NEXT_PUBLIC_SUPABASE_URL)),
          status: row.status,
          published_at: row.published_at,
          like_count: row.like_count ?? 0,
          comment_count: row.comment_count ?? 0,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_saved: true,
          is_liked: likedIds.has(row.id),
          tags: row.tags ?? [],
          primary_category_id: row.primary_category_id ?? null,
          offering_id: row.offering_id ?? null,
          offering: offering ?? null,
        };
      })
      .filter(Boolean) as ExplorePost[];

    return successResponse({
      ...collection,
      post_count: posts.length,
      posts,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch collection");
  }
}

/**
 * PATCH /api/explore/collections/[id]
 * Update collection name/slug. Auth required.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthInApi(request);
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: existing } = await supabaseAdmin
      .from("explore_collections")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (!existing) return errorResponse("Collection not found", "NOT_FOUND", 404);

    const body = await request.json();
    const updates: Record<string, string> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.slug === "string" && body.slug.trim()) {
      updates.slug = body.slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }
    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const { data: updated, error } = await supabaseAdmin
      .from("explore_collections")
      .update(updates)
      .eq("id", id)
      .select("id, user_id, name, slug, created_at, updated_at")
      .single();
    if (error) return handleApiError(error, "Failed to update collection");
    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update collection");
  }
}

/**
 * DELETE /api/explore/collections/[id]
 * Delete collection. Auth required.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthInApi(request);
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("explore_collections")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return handleApiError(error, "Failed to delete collection");
    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete collection");
  }
}
