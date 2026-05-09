import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { PROVIDER_OPS_ASSIGNABLE_ROLES } from "@/lib/provider-ops/assignable-admin-roles";

function sanitizeIlikeTerm(raw: string) {
  return raw.trim().replace(/[%_\\,]/g, "");
}

const LIMIT = 40;

/**
 * Searchable list of admin users who can own provider leads (same role gate as assignment validation).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const q = sanitizeIlikeTerm(searchParams.get("q") || "");

    let query = supabase
      .from("users")
      .select("id, full_name, email")
      .in("role", PROVIDER_OPS_ASSIGNABLE_ROLES)
      .is("deactivated_at", null)
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(LIMIT);

    if (q.length > 0) {
      const pattern = `%${q}%`;
      query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const users = (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: typeof row.full_name === "string" ? row.full_name : null,
      email: typeof row.email === "string" ? row.email : null,
    }));

    return successResponse({ users });
  } catch (error) {
    return handleApiError(error, "Failed to list assignable users");
  }
}
