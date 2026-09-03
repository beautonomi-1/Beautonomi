import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const STATUSES = new Set(["proposed", "approved", "rejected", "posted"]);

/**
 * GET /api/admin/finance/ledger-repair
 * Lists ledger repair proposals for the admin tenant. Query: status, kind, limit, offset.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const kind = searchParams.get("kind");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    let query = supabase
      .from("ledger_repair_proposals")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId);
    if (status && STATUSES.has(status)) query = query.eq("status", status);
    if (kind === "missing_online_charge_ledger" || kind === "adjustment") query = query.eq("kind", kind);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.proposed_by, r.approved_by, r.rejected_by])
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ];
    let usersById: Record<string, { full_name: string | null; email: string | null }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id, full_name, email").in("id", userIds);
      usersById = Object.fromEntries(
        ((users ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((u) => [
          u.id,
          { full_name: u.full_name, email: u.email },
        ]),
      );
    }

    return successResponse({
      proposals: rows.map((r) => ({
        ...r,
        proposed_by_user: r.proposed_by ? usersById[String(r.proposed_by)] ?? null : null,
        approved_by_user: r.approved_by ? usersById[String(r.approved_by)] ?? null : null,
        rejected_by_user: r.rejected_by ? usersById[String(r.rejected_by)] ?? null : null,
      })),
      total: count ?? rows.length,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error, "Failed to list ledger repair proposals");
  }
}
