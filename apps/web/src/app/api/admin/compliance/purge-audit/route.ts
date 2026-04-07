import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/admin/compliance/purge-audit?limit=50
 *
 * Superadmin only. Read-only compliance purge log (immutable audit table).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));

    const { data, error } = await supabase
      .from("compliance_purge_audit_log")
      .select(
        "id, created_at, actor_user_id, tenant_id, purge_type, target_user_id, provider_id, reason, report, purged_user_ids",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return Response.json(
        { data: null, error: { message: error.message, code: "QUERY_FAILED" } },
        { status: 500 },
      );
    }

    return successResponse({
      entries: data ?? [],
      limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load compliance purge audit");
  }
}
