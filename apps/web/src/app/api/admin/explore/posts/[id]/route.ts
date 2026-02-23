import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * PATCH /api/admin/explore/posts/[id]
 * Hide/unhide post. Superadmin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabaseAdmin = await getSupabaseAdmin();
    const { id } = await params;

    const body = await request.json();
    const { is_hidden } = body;

    if (typeof is_hidden !== "boolean") {
      return errorResponse("is_hidden must be boolean", "VALIDATION_ERROR", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("explore_posts")
      .update({ is_hidden })
      .eq("id", id)
      .select("id, is_hidden")
      .single();

    if (error) return handleApiError(error, "Failed to update post");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update post");
  }
}
