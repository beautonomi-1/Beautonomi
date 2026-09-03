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
import { executeLedgerRepairProposal, type LedgerRepairProposalRow } from "@/lib/finance/ledger-repair";

/**
 * POST /api/admin/finance/ledger-repair/[id]/approve
 * Superadmin only; approver must differ from proposer (maker ≠ checker).
 * Marks the proposal approved, posts the ledger effect, then marks posted (or records error).
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireSuperadmin(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await ctx.params;
    const supabase = getSupabaseAdmin();

    const { data: row, error: loadError } = await supabase
      .from("ledger_repair_proposals")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) return errorResponse("Proposal not found", "NOT_FOUND", 404);
    const proposal = row as LedgerRepairProposalRow;

    if (proposal.tenant_id && String(proposal.tenant_id) !== tenantId) {
      return errorResponse("Proposal not in admin tenant scope", "FORBIDDEN", 403);
    }
    if (proposal.proposed_by === user.id) {
      await writeDenied(request, user, proposal.id, "maker_checker_same_user");
      return errorResponse(
        "Maker-checker violation: the proposer cannot approve their own proposal",
        "MAKER_CHECKER_MUST_DIFFER",
        403,
      );
    }
    if (proposal.status === "posted") {
      return errorResponse("Proposal already posted", "INVALID_STATE", 409);
    }
    if (proposal.status === "rejected") {
      return errorResponse("Proposal was rejected", "INVALID_STATE", 409);
    }

    // Claim: proposed|approved(with error) → approved. Conditional update prevents double-approval races.
    const nowIso = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("ledger_repair_proposals")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: nowIso,
        error: null,
      })
      .eq("id", id)
      .in("status", ["proposed", "approved"])
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      return errorResponse("Proposal is no longer approvable", "INVALID_STATE", 409);
    }

    const executed = await executeLedgerRepairProposal(supabase, proposal, { approvedBy: user.id });
    const reqMeta = extractRequestMeta(request);

    if (executed.ok === false) {
      await supabase
        .from("ledger_repair_proposals")
        .update({ error: executed.reason.slice(0, 2000) })
        .eq("id", id);

      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role,
        action: "finance.ledger_repair.approve",
        entity_type: "ledger_repair_proposal",
        entity_id: id,
        module: "finance",
        risk_level: "critical",
        retention_tier: "financial",
        status: "failed",
        reason: executed.reason,
        metadata: { kind: proposal.kind, code: executed.code, proposed_by: proposal.proposed_by },
        ip_address: reqMeta.ip_address,
        user_agent: reqMeta.user_agent,
      });

      const httpStatus = executed.code === "PERIOD_LOCKED" ? 409 : executed.code === "INVALID_PAYLOAD" ? 400 : 502;
      return errorResponse(executed.reason, executed.code, httpStatus);
    }

    const { data: posted, error: postError } = await supabase
      .from("ledger_repair_proposals")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        result: executed.result,
        error: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (postError) throw postError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "finance.ledger_repair.approve",
      entity_type: "ledger_repair_proposal",
      entity_id: id,
      module: "finance",
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      metadata: {
        kind: proposal.kind,
        proposed_by: proposal.proposed_by,
        payload: proposal.payload,
        result: executed.result,
        skipped: executed.skipped,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ proposal: posted, skipped: executed.skipped });
  } catch (error) {
    return handleApiError(error, "Failed to approve ledger repair proposal");
  }
}

async function writeDenied(
  request: NextRequest,
  user: { id: string; role: string },
  proposalId: string,
  reason: string,
) {
  const reqMeta = extractRequestMeta(request);
  await writeAuditLog({
    actor_user_id: user.id,
    actor_role: user.role,
    action: "finance.ledger_repair.approve",
    entity_type: "ledger_repair_proposal",
    entity_id: proposalId,
    module: "finance",
    risk_level: "high",
    retention_tier: "financial",
    status: "failed",
    reason,
    ip_address: reqMeta.ip_address,
    user_agent: reqMeta.user_agent,
  });
}
