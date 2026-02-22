import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/control-plane/config-change-log
 * Query: page, limit, area, record_key
 * Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;
    const area = searchParams.get("area") ?? undefined;
    const recordKey = searchParams.get("record_key") ?? undefined;

    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("config_change_log")
      .select("id, changed_by, area, record_key, before_state, after_state, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (area) q = q.eq("area", area);
    if (recordKey) q = q.eq("record_key", recordKey);

    const { data, error, count } = await q;

    if (error) throw error;

    return successResponse({
      items: data ?? [],
      total: count ?? 0,
      page,
      limit,
      has_more: (count ?? 0) > offset + limit,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch config change log");
  }
}
