import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import type { ExplorePost } from "@/types/explore";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

/**
 * GET /api/explore/posts/mine
 * List own provider's posts (draft + published)
 * Supports cookie (web) and Bearer token (provider mobile app).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    // Default 500 / max 1000 so provider sees all their posts (was 50/100)
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    const { data: rows, error } = await supabaseAdmin
      .from("explore_posts")
      .select(
        `
        id,
        provider_id,
        created_by_user_id,
        caption,
        media_urls,
        status,
        published_at,
        like_count,
        comment_count,
        created_at,
        updated_at,
        providers:provider_id(business_name, slug)
      `
      )
      .eq("provider_id", providerId)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (error) return handleApiError(error, "Failed to fetch posts");

    const postIds = (rows || []).map((r: any) => r.id);
    const viewCounts: Record<string, number> = {};

    if (postIds.length > 0) {
      const { data: viewCountRows, error: viewErr } = await supabaseAdmin.rpc(
        "get_explore_view_counts",
        { post_ids: postIds }
      );
      if (!viewErr && viewCountRows) {
        for (const row of viewCountRows as { post_id: string; view_count: number }[]) {
          viewCounts[row.post_id] = Number(row.view_count) || 0;
        }
      }
    }

    const data: ExplorePost[] = (rows || []).map((r: any) => ({
      id: r.id,
      provider_id: r.provider_id,
      provider: r.providers
        ? { business_name: r.providers.business_name, slug: r.providers.slug }
        : { business_name: "", slug: "" },
      created_by_user_id: r.created_by_user_id,
      caption: r.caption,
      media_urls: (r.media_urls || []).map((p: string) =>
        toPublicMediaUrl(p, process.env.NEXT_PUBLIC_SUPABASE_URL)
      ),
      status: r.status,
      published_at: r.published_at,
      like_count: r.like_count ?? 0,
      comment_count: r.comment_count ?? 0,
      view_count: viewCounts[r.id] ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch posts");
  }
}
