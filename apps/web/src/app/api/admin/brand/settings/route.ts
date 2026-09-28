import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { loadBrandSettings } from "@/lib/brand-marketing/settings";

const patchSchema = z.object({
  go_live_budget_threshold: z.coerce.number().optional(),
  fiscal_year_start_month: z.coerce.number().min(1).max(12).optional(),
  stale_metric_days: z.coerce.number().min(1).max(90).optional(),
  approval_sla_hours: z.coerce.number().min(1).max(720).optional(),
  self_approve_below: z.coerce.number().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const settings = await loadBrandSettings(supabase, access.tenantId);
    return successResponse(settings);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load brand settings");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const role = String(access.user.role).toLowerCase();
    if (role !== "superadmin" && role !== "admin_marketing") {
      return errorResponse("Forbidden", "FORBIDDEN", 403);
    }

    const patch = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_settings")
      .upsert(
        { tenant_id: access.tenantId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.settings_updated",
      entityType: "brand_settings",
      entityId: access.tenantId,
      risk: "high",
      retention: "permanent",
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update brand settings");
  }
}
