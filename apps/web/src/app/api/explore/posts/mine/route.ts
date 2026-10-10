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
import { EXPLORE_POST_SELECT_WITH_PROVIDER } from "@/lib/explore/post-select";
import { mapExplorePostRow } from "@/lib/explore/post-mapper";
import { enrichExplorePostsWithSoundUrls } from "@/lib/explore/sound-enrich";
import { isExploreProviderPostsEnabled } from "@/lib/explore/explore-feature-gates";

/**
 * GET /api/explore/posts/mine
 * List own provider's posts (draft + published)
 * Supports cookie (web) and Bearer token (provider mobile app).
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await isExploreProviderPostsEnabled(null))) {
      return errorResponse("Explore posts are disabled", "FORBIDDEN", 403);
    }
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
    const postId = searchParams.get("id")?.trim();
    if (postId) {
      const { data: row, error: oneErr } = await supabaseAdmin
        .from("explore_posts")
        .select(EXPLORE_POST_SELECT_WITH_PROVIDER)
        .eq("id", postId)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (oneErr) return handleApiError(oneErr, "Failed to fetch post");
      if (!row) return errorResponse("Post not found", "NOT_FOUND", 404);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const mapped: ExplorePost = {
        ...mapExplorePostRow(row, { supabaseUrl, savedIds: new Set(), likedIds: new Set() }),
        view_count: 0,
        offering: null,
      };
      const [enriched] = await enrichExplorePostsWithSoundUrls(supabaseAdmin, [mapped], supabaseUrl);
      return successResponse(enriched ?? mapped);
    }

    const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 100));
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
    const wantsPaginated = searchParams.has("limit") || searchParams.has("offset");

    const { data: rows, error, count } = await supabaseAdmin
      .from("explore_posts")
      .select(EXPLORE_POST_SELECT_WITH_PROVIDER, { count: "exact" })
      .eq("provider_id", providerId)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return handleApiError(error, "Failed to fetch posts");

    const postIds = (rows || []).map((r: any) => r.id);
    const viewCounts: Record<string, number> = {};
    const offeringIds = [...new Set((rows || []).map((r: any) => r.offering_id).filter(Boolean))];
    const offeringMap = new Map<string, { id: string; name: string; price?: number; duration_minutes?: number }>();

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
    if (offeringIds.length > 0) {
      const { data: offData } = await supabaseAdmin
        .from("offerings")
        .select("id, title, price, duration_minutes")
        .in("id", offeringIds);
      (offData || []).forEach((o: any) =>
        offeringMap.set(o.id, { id: o.id, name: o.title ?? "", price: o.price != null ? Number(o.price) : undefined, duration_minutes: o.duration_minutes ?? undefined })
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const mapped: ExplorePost[] = (rows || []).map((r: any) => ({
      ...mapExplorePostRow(r, { supabaseUrl, savedIds: new Set(), likedIds: new Set() }),
      view_count: viewCounts[r.id] ?? 0,
      offering: (r.offering_id ? offeringMap.get(r.offering_id) : null) ?? null,
    }));
    const data = await enrichExplorePostsWithSoundUrls(supabaseAdmin, mapped, supabaseUrl);

    if (wantsPaginated) {
      return successResponse({
        posts: data,
        total: count ?? data.length,
        pagination: {
          limit,
          offset,
          has_more: offset + limit < (count ?? data.length),
        },
      });
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch posts");
  }
}
