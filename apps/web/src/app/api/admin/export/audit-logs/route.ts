import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/export/audit-logs
 *
 * Export audit logs to CSV (rate limited). Uses admin client so actor (user) is included.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRoleInApi(["superadmin"], request);
    const { allowed, retryAfter } = checkRateLimit(auth.user.id, "export:audit-logs");
    if (!allowed) {
      return errorResponse(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const entityType = searchParams.get("entity_type");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("audit_logs")
      .select(`
        *,
        actor:users!audit_logs_actor_user_id_fkey(id, full_name, email)
      `)
      .order("created_at", { ascending: false });

    if (action && action !== "all") {
      query = query.eq("action", action);
    }

    if (entityType && entityType !== "all") {
      query = query.eq("entity_type", entityType);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: logs, error } = await query;

    if (error) {
      return handleApiError(error, "Failed to fetch audit logs");
    }

    // Convert to CSV
    const headers = [
      "ID",
      "Action",
      "Actor User ID",
      "Actor Name",
      "Actor Email",
      "Actor Role",
      "Entity Type",
      "Entity ID",
      "Metadata",
      "Created At",
    ];

    const rows = (logs || []).map((log: any) => [
      log.id,
      log.action,
      log.actor_user_id || "",
      log.actor?.full_name || "",
      log.actor?.email || "",
      log.actor_role || "",
      log.entity_type || "",
      log.entity_id || "",
      JSON.stringify(log.metadata || {}),
      log.created_at,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-logs-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export audit logs");
  }
}
