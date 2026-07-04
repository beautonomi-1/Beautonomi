/**
 * GET /api/admin/identity-verification/sessions
 *
 * Paginated list of verification sessions with filtering.
 * Superadmin only.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const { searchParams } = new URL(request.url);
    const page      = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const perPage   = Math.min(100, Math.max(1, Number(searchParams.get("per_page") ?? "25")));
    const status    = searchParams.get("status") ?? "";
    const persona   = searchParams.get("persona") ?? "";
    const hasFlags  = searchParams.get("has_flags") === "true";
    const nameMismatch = searchParams.get("name_mismatch") === "true";
    const q         = searchParams.get("q") ?? "";

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("identity_verification_sessions")
      .select(`
        id, persona_type, provider, provider_session_id, status,
        name_mismatch_flag, identity_dedupe_flag, under_age_flag,
        rejection_reason, created_at, updated_at, user_id, provider_id, tenant_id,
        users:user_id ( email, display_name )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (status) query = query.eq("status", status);
    if (persona) query = query.eq("persona_type", persona);
    if (hasFlags) {
      query = query.or("name_mismatch_flag.eq.true,identity_dedupe_flag.eq.true,under_age_flag.eq.true");
    }
    if (nameMismatch) query = query.eq("name_mismatch_flag", true);

    const { data, count, error } = await query;
    if (error) throw error;

    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const user = row.users as { email?: string; display_name?: string } | null;
      return {
        ...row,
        users: undefined,
        user_email: user?.email,
        user_name: user?.display_name,
      };
    });

    return successResponse({
      items,
      total:    count ?? 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
