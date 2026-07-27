import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";
import { requireSocialAccess } from "@/lib/safety/require-social-access";

export interface ExploreCollection {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  post_count?: number;
}

/**
 * GET /api/explore/collections
 * List current user's collections (boards) with post counts. Auth required.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { data: collections, error } = await supabaseAdmin
      .from("explore_collections")
      .select("id, user_id, name, slug, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) return handleApiError(error, "Failed to fetch collections");

    const list = collections || [];
    if (list.length === 0) {
      return successResponse({ data: [] });
    }

    const collectionIds = list.map((c: any) => c.id);
    const { data: counts } = await supabaseAdmin
      .from("explore_collection_posts")
      .select("collection_id")
      .in("collection_id", collectionIds);
    const countByCollection = new Map<string, number>();
    (counts || []).forEach((r: any) => {
      countByCollection.set(r.collection_id, (countByCollection.get(r.collection_id) ?? 0) + 1);
    });

    const data: ExploreCollection[] = list.map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      name: c.name,
      slug: c.slug,
      created_at: c.created_at,
      updated_at: c.updated_at,
      post_count: countByCollection.get(c.id) ?? 0,
    }));
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to fetch collections");
  }
}

/**
 * POST /api/explore/collections
 * Create a collection (board). Auth required. Body: { name } (slug derived from name if not provided).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    await requireSocialAccess(user.id, "like_or_save", request);
    const supabaseAdmin = await getSupabaseAdmin();

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return errorResponse("name is required", "VALIDATION_ERROR", 400);
    }
    const slug =
      typeof body.slug === "string" && body.slug.trim()
        ? body.slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        : name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const { data: created, error } = await supabaseAdmin
      .from("explore_collections")
      .insert({ user_id: user.id, name, slug })
      .select("id, user_id, name, slug, created_at, updated_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse("A collection with this name/slug already exists", "VALIDATION_ERROR", 400);
      }
      return handleApiError(error, "Failed to create collection");
    }
    return successResponse({ ...created, post_count: 0 }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create collection");
  }
}
