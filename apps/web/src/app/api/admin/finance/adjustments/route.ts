import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { enforcePeriodLock } from "@/lib/finance/period-lock";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { manualAdjustmentSchema, postManualFinanceAdjustment } from "@/lib/finance/post-manual-adjustment";

const createAdjustmentSchema = manualAdjustmentSchema;

/**
 * GET /api/admin/finance/adjustments
 * Returns recent manual finance adjustments for close reviews.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    const { data, error } = await supabase
      .from("finance_transactions")
      .select("id, amount, net, description, metadata, created_at, provider_id, booking_id")
      .eq("tenant_id", tenantId)
      .eq("transaction_type", "manual_adjustment")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    return successResponse({ adjustments: data ?? [], limit });
  } catch (error) {
    return handleApiError(error, "Failed to fetch finance adjustments");
  }
}

/**
 * POST /api/admin/finance/adjustments
 * Creates a controlled manual adjustment entry in the finance ledger.
 *
 * Maker-checker: only a superadmin posts directly (period-lock enforced).
 * Any other finance admin gets a `ledger_repair_proposals` row (status
 * `proposed`, 202) that a *different* superadmin must approve via
 * POST /api/admin/finance/ledger-repair/[id]/approve.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const payload = createAdjustmentSchema.safeParse(await request.json());
    if (!payload.success) {
      return errorResponse("Invalid adjustment payload", "VALIDATION_ERROR", 400, {
        issues: payload.error.issues,
      });
    }

    const effectiveAt = payload.data.effective_at ?? new Date().toISOString();
    const guard = await enforcePeriodLock(supabase, tenantId, effectiveAt);
    if (guard) return guard;

    const amount = Number(payload.data.amount);
    const description = payload.data.description.trim();
    const adjustmentCode = payload.data.adjustment_code?.trim() || "MANUAL_ADJUSTMENT";
    const reqMeta = extractRequestMeta(request);

    if ((user.role as string) !== "superadmin") {
      const { data: proposal, error: proposalError } = await supabase
        .from("ledger_repair_proposals")
        .insert({
          tenant_id: tenantId,
          kind: "adjustment",
          payload: { ...payload.data, description, effective_at: effectiveAt, adjustment_code: adjustmentCode },
          proposed_by: user.id,
          status: "proposed",
          note: "Proposed from Finance → Adjustments",
        })
        .select("*")
        .single();
      if (proposalError) throw proposalError;

      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role,
        action: "finance.ledger_repair.propose",
        entity_type: "ledger_repair_proposal",
        entity_id: (proposal as { id: string }).id,
        module: "finance",
        risk_level: "high",
        retention_tier: "financial",
        status: "succeeded",
        metadata: { kind: "adjustment", amount, description, effective_at: effectiveAt, adjustment_code: adjustmentCode },
        ip_address: reqMeta.ip_address,
        user_agent: reqMeta.user_agent,
      });

      return successResponse(
        {
          adjustment: null,
          proposal,
          message: "Adjustment queued for superadmin approval (maker-checker).",
        },
        202,
      );
    }

    const posted = await postManualFinanceAdjustment(supabase, {
      tenantId,
      input: { ...payload.data, description, effective_at: effectiveAt, adjustment_code: adjustmentCode },
      createdBy: user.id,
      source: "admin_finance_adjustment",
    });
    if (posted.ok === false) {
      throw posted.error instanceof Error ? posted.error : new Error(posted.reason);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "finance.adjustment.create",
      entity_type: "finance_transaction",
      entity_id: posted.adjustment.id,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      metadata: {
        amount,
        description,
        effective_at: effectiveAt,
        adjustment_code: adjustmentCode,
        direct_post: true,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ adjustment: posted.adjustment, proposal: null });
  } catch (error) {
    return handleApiError(error, "Failed to create finance adjustment");
  }
}

