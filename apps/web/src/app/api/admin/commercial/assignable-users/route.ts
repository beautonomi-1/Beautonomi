import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { PROVIDER_OPS_ASSIGNABLE_ROLES } from "@/lib/provider-ops/assignable-admin-roles";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("role", [...PROVIDER_OPS_ASSIGNABLE_ROLES])
      .is("deactivated_at", null)
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(50);

    if (error) throw error;

    return successResponse({
      users: (data ?? []).map((row) => ({
        id: row.id as string,
        full_name: typeof row.full_name === "string" ? row.full_name : null,
        email: typeof row.email === "string" ? row.email : null,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to list assignable users");
  }
}
