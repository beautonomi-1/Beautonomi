import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  unauthorizedResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";

/**
 * GET /api/admin/bootstrap
 * Minimal identity for admin SPA shell (session cookie auth).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const supabase = await getSupabaseServer(request);

    let full_name: string | null = user.full_name ?? null;
    let email: string | null = user.email ?? null;

    if (supabase && (!full_name || !email)) {
      const { data: row } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      if (row) {
        full_name = (row as { full_name?: string | null }).full_name ?? full_name;
        email = (row as { email?: string | null }).email ?? email;
      }
    }

    const role = user.role as UserRole;
    return successResponse({
      user: {
        id: user.id,
        email,
        full_name,
      },
      role,
      is_superadmin: role === "superadmin",
    });
  } catch (error) {
    // Align with ADMIN_SPA_AUTH_DECISION: unauthenticated → 401 (handleApiError maps
    // "Authentication required" to 403 for historical reasons).
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("authentication required")) {
      return unauthorizedResponse(message || "Authentication required");
    }
    return handleApiError(error);
  }
}
