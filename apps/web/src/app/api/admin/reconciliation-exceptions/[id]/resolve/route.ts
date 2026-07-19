import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveReconciliationException } from "@/lib/agents/services/gap-services";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const adminTenantId = await resolveAdminApiTenantId(request);
    const { id } = await ctx.params;
    const body = await request.json();
    if (!body.checker_user_id) {
      return handleApiError(new Error("checker_user_id required"), "Maker-checker requires a distinct checker");
    }
    if (!["matched", "written_off", "escalated"].includes(body.resolution)) {
      return handleApiError(new Error("invalid resolution"), "Resolution must be matched, written_off, or escalated");
    }
    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase.from("reconciliation_exceptions").select("tenant_id").eq("id", id).maybeSingle();
    if (!row) return handleApiError(new Error("Not found"), "Exception not found");
    if (String(row.tenant_id) !== adminTenantId) {
      return handleApiError(new Error("Forbidden"), "Exception not in admin tenant scope");
    }

    const data = await resolveReconciliationException({
      exceptionId: id,
      tenantId: row.tenant_id,
      makerUserId: body.maker_user_id ?? user.id,
      checkerUserId: body.checker_user_id,
      resolution: body.resolution,
      makerUserIdMustDifferFromChecker: true,
    });

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.reconciliation_exception.resolve",
      entity_type: "reconciliation_exception",
      entity_id: id,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      status: "succeeded",
      after_json: data as Record<string, unknown>,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to resolve reconciliation exception");
  }
}
