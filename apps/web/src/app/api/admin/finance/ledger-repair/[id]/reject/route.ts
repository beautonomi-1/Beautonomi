import { NextRequest } from "next/server";
import {
  requireSuperadmin,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/finance/ledger-repair/[id]/reject
 * Superadmin only. Body: { reason?: string }
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireSuperadmin(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("ledger_repair_proposals")
      .select("id, tenant_id, status, proposed_by")
      .eq("id", id)
      .maybeSingle();
    if (!row) return errorResponse("Proposal not found", "NOT_FOUND", 404);
    const proposal = row as { tenant_id: string | null; status: string; proposed_by?: string | null };
    if (proposal.tenant_id && String(proposal.tenant_id) !== tenantId) {
      return errorResponse("Proposal not in admin tenant scope", "FORBIDDEN", 403);
    }
    if (proposal.proposed_by === user.id) {
      return errorResponse(
        "Maker-checker violation: the proposer cannot reject their own proposal",
        "MAKER_CHECKER_MUST_DIFFER",
        403,
      );
    }
    if (proposal.status === "posted") {
      return errorResponse("Posted proposals cannot be rejected", "INVALID_STATE", 409);
    }

    const { data: updated, error } = await supabase
      .from("ledger_repair_proposals")
      .update({
        status: "rejected",
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        error: reason || null,
      })
      .eq("id", id)
      .in("status", ["proposed", "approved"])
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return errorResponse("Proposal is no longer open", "INVALID_STATE", 409);

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "finance.ledger_repair.reject",
      entity_type: "ledger_repair_proposal",
      entity_id: id,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      status: "succeeded",
      reason: reason || null,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ proposal: updated });
  } catch (error) {
    return handleApiError(error, "Failed to reject ledger repair proposal");
  }
}
