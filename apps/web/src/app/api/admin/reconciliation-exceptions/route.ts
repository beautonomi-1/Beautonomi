import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const STATUSES = new Set(["open", "matched", "written_off", "escalated"]);
const SOURCES = new Set(["ledger", "psp", "bank"]);

/**
 * GET /api/admin/reconciliation-exceptions
 * Query: status, source, assigned_to ("me" | uuid | "unassigned"), limit (<=200), offset
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const assignedTo = searchParams.get("assigned_to");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    let query = supabase
      .from("reconciliation_exceptions")
      .select(
        "id, tenant_id, status, source, currency, psp, amount, external_id, internal_id, mismatch_reason, maker_user_id, checker_user_id, assigned_to, assigned_at, resolution_note, metadata, created_at, resolved_at",
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);

    if (status && STATUSES.has(status)) query = query.eq("status", status);
    if (source && SOURCES.has(source)) query = query.eq("source", source);
    if (assignedTo === "me") query = query.eq("assigned_to", user.id);
    else if (assignedTo === "unassigned") query = query.is("assigned_to", null);
    else if (assignedTo) query = query.eq("assigned_to", assignedTo);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.assigned_to, r.maker_user_id, r.checker_user_id])
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ];
    let usersById: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      usersById = Object.fromEntries(
        ((users ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((u) => [
          u.id,
          { full_name: u.full_name, email: u.email },
        ]),
      );
    }

    return successResponse({
      exceptions: rows.map((r) => ({
        ...r,
        assigned_to_user: r.assigned_to ? usersById[String(r.assigned_to)] ?? null : null,
        maker_user: r.maker_user_id ? usersById[String(r.maker_user_id)] ?? null : null,
        checker_user: r.checker_user_id ? usersById[String(r.checker_user_id)] ?? null : null,
      })),
      total: count ?? rows.length,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to list reconciliation exceptions");
  }
}
