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
 * Hide/unhide post, optional moderation_notes. Superadmin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();
    const { id } = await params;

    const body = await request.json();
    const { is_hidden, moderation_notes } = body;

    if (typeof is_hidden !== "boolean") {
      return errorResponse("is_hidden must be boolean", "VALIDATION_ERROR", 400);
    }

    const update: Record<string, any> = {
      is_hidden,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    };
    if (moderation_notes !== undefined) {
      update.moderation_notes = is_hidden ? (moderation_notes || null) : null;
    }

    const { data, error } = await supabaseAdmin
      .from("explore_posts")
      .update(update)
      .eq("id", id)
      .select("id, is_hidden, moderation_notes, moderated_at")
      .single();

    if (error) return handleApiError(error, "Failed to update post");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update post");
  }
}
