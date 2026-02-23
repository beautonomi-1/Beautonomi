import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/explore/posts
 * List all posts with filters. Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabaseAdmin = await getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");
    const hidden = searchParams.get("hidden");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    let query = supabaseAdmin
      .from("explore_posts")
      .select(
        `
        id,
        provider_id,
        caption,
        media_urls,
        status,
        published_at,
        like_count,
        is_hidden,
        created_at,
        providers:provider_id(business_name, slug)
      `
      )
      .order("published_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (providerId) query = query.eq("provider_id", providerId);
    if (hidden === "true") query = query.eq("is_hidden", true);
    if (hidden === "false") query = query.eq("is_hidden", false);

    const { data, error } = await query;

    if (error) return handleApiError(error, "Failed to fetch posts");
    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch posts");
  }
}
