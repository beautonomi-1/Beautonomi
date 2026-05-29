import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/compliance/lookup-user/[id]
 *
 * Superadmin only. Platform-wide user lookup for compliance purge (no tenant scope).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: userRow, error: userError } = await admin
      .from("users")
      .select("id, email, full_name, role")
      .eq("id", id)
      .maybeSingle();

    if (userError) {
      console.error("[compliance/lookup-user] users lookup:", userError);
      return handleApiError(userError, "Failed to lookup user");
    }

    if (userRow) {
      return successResponse({
        id: userRow.id,
        email: userRow.email ?? null,
        full_name: userRow.full_name ?? null,
        role: userRow.role ?? null,
      });
    }

    const { data: authRow, error: authError } = await admin.auth.admin.getUserById(id);
    if (authError) {
      console.warn("[compliance/lookup-user] auth.admin.getUserById:", authError.message);
      return notFoundResponse("User not found");
    }

    const authUser = authRow?.user;
    if (!authUser) {
      return notFoundResponse("User not found");
    }

    return successResponse({
      id: authUser.id,
      email: authUser.email ?? null,
      full_name:
        typeof authUser.user_metadata?.full_name === "string"
          ? authUser.user_metadata.full_name
          : null,
      role: null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to lookup user");
  }
}
