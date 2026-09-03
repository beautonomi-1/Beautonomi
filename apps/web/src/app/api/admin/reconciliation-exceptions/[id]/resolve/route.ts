import { NextRequest } from "next/server";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveReconciliationException } from "@/lib/agents/services/gap-services";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const RESOLUTIONS = new Set(["matched", "written_off", "escalated"]);

/**
 * POST /api/admin/reconciliation-exceptions/[id]/resolve
 * Body: { resolution, checker_user_id?, maker_user_id?, note? }
 *
 * Maker-checker: the caller is the checker by default; the maker defaults to the
 * assignee (or explicit maker_user_id) and must differ from the checker.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const adminTenantId = await resolveAdminApiTenantId(request);
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      resolution?: string;
      checker_user_id?: string;
      maker_user_id?: string;
      note?: string;
    };
    if (!body.resolution || !RESOLUTIONS.has(body.resolution)) {
      return errorResponse(
        "Resolution must be matched, written_off, or escalated",
        "VALIDATION_ERROR",
        400,
      );
    }
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("reconciliation_exceptions")
      .select("tenant_id, status, assigned_to, maker_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) return errorResponse("Exception not found", "NOT_FOUND", 404);
    const exception = row as {
      tenant_id: string;
      status: string;
      assigned_to?: string | null;
      maker_user_id?: string | null;
    };
    if (String(exception.tenant_id) !== adminTenantId) {
      return errorResponse("Exception not in admin tenant scope", "FORBIDDEN", 403);
    }
    if (exception.status !== "open") {
      return errorResponse("Exception is already resolved", "INVALID_STATE", 409);
    }

    const checkerUserId = body.checker_user_id ?? user.id;
    const makerUserId =
      body.maker_user_id ?? exception.assigned_to ?? exception.maker_user_id ?? null;
    if (!makerUserId) {
      return errorResponse(
        "Assign the exception to a maker (or pass maker_user_id) before resolving — maker and checker must be different admins",
        "MAKER_REQUIRED",
        400,
      );
    }
    if (makerUserId === checkerUserId) {
      return errorResponse(
        "Maker and checker must be different admins",
        "MAKER_CHECKER_MUST_DIFFER",
        403,
      );
    }

    const data = await resolveReconciliationException({
      exceptionId: id,
      tenantId: exception.tenant_id,
      makerUserId,
      checkerUserId,
      resolution: body.resolution as "matched" | "written_off" | "escalated",
      makerUserIdMustDifferFromChecker: true,
    });

    if (note) {
      await supabase
        .from("reconciliation_exceptions")
        .update({ resolution_note: note })
        .eq("id", id);
    }

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
      metadata: { resolution: body.resolution, maker_user_id: makerUserId, checker_user_id: checkerUserId, note },
      after_json: data as Record<string, unknown>,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ ...(data as Record<string, unknown>), resolution_note: note || null });
  } catch (error) {
    return handleApiError(error as Error, "Failed to resolve reconciliation exception");
  }
}
