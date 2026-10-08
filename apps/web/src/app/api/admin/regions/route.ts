import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  forbiddenResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/regions
 * Superadmin: list regions for gateway / launch tooling.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    if (user.role !== "superadmin") {
      return forbiddenResponse("Superadmin only");
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("regions")
      .select("id, code, name, default_currency, is_active")
      .order("code", { ascending: true });
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error, "Failed to load regions");
  }
}
