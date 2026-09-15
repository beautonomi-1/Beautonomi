import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";

/**
 * POST /api/admin/notifications/bulk-delete
 * Hard-delete multiple notification rows owned by the caller.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.map((id) => String(id).trim()).filter(Boolean))].slice(0, 100)
      : [];

    if (ids.length === 0) {
      return successResponse({ deleted: 0 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id)
      .in("id", ids)
      .select("id");

    if (error) throw error;

    return successResponse({ deleted: (data ?? []).length });
  } catch (error) {
    return handleApiError(error, "Failed to bulk delete notifications");
  }
}
