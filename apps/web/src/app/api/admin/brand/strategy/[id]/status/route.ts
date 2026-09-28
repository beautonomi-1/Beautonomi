import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import {
  archiveStrategy,
  getStrategyById,
  reviseStrategy,
  submitStrategy,
  unarchiveStrategy,
} from "@/lib/brand-marketing/strategy";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["submit", "revise", "archive", "unarchive"]),
  approver_id: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const body = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const before = await getStrategyById(supabase, access.tenantId, id);
    if (!before) return errorResponse("Not found", "NOT_FOUND", 404);

    if (body.action === "submit") {
      if (!body.approver_id) return errorResponse("Approver required", "VALIDATION_ERROR", 400);
      const result = await submitStrategy(supabase, access.tenantId, id, access.user.id, body.approver_id);
      if (result.ok === false) return errorResponse(result.message, result.code, 400);
      await auditBrandMutation(request, supabase, access, {
        action: "brand.strategy_submitted",
        entityType: "brand_strategy",
        entityId: id,
        risk: "high",
        retention: "permanent",
        meta: { approval_id: result.approval_id },
      });
      return successResponse(result);
    }

    if (body.action === "revise") {
      if (!body.reason?.trim()) return errorResponse("Reason required", "VALIDATION_ERROR", 400);
      const result = await reviseStrategy(supabase, access.tenantId, id, body.reason);
      if (result.ok === false) return errorResponse(result.message, "VALIDATION_ERROR", 400);
      await auditBrandMutation(request, supabase, access, {
        action: "brand.strategy_revised",
        entityType: "brand_strategy",
        entityId: id,
        risk: "high",
        retention: "permanent",
        reason: body.reason,
      });
      return successResponse({ ok: true });
    }

    if (body.action === "archive") {
      if (before.status === "approved" && !body.reason?.trim()) {
        return errorResponse("Reason required to archive approved strategy", "VALIDATION_ERROR", 400);
      }
      const result = await archiveStrategy(supabase, access.tenantId, id, body.reason);
      if (result.ok === false) return errorResponse(result.message, "VALIDATION_ERROR", 400);
      await auditBrandMutation(request, supabase, access, {
        action: "brand.strategy_archived",
        entityType: "brand_strategy",
        entityId: id,
        risk: "high",
        retention: "permanent",
        reason: body.reason,
      });
      return successResponse({ ok: true });
    }

    await unarchiveStrategy(supabase, access.tenantId, id);
    await auditBrandMutation(request, supabase, access, {
      action: "brand.strategy_unarchived",
      entityType: "brand_strategy",
      entityId: id,
      risk: "medium",
      retention: "operational",
    });
    return successResponse({ ok: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update strategy status");
  }
}
