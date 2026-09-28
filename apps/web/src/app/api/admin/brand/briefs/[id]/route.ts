import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { briefRowToSnapshot } from "@/lib/brand-marketing/brief-versions";

const patchSchema = z.object({
  name: z.string().optional(),
  objective: z.string().optional(),
  market_notes: z.string().optional(),
  budget_envelope: z.coerce.number().optional(),
  flight_start: z.string().optional(),
  flight_end: z.string().optional(),
  success_metric: z.enum(["demand", "supply"]).optional(),
  success_target: z.coerce.number().optional(),
  channels_requested: z.array(z.string()).optional(),
  notes: z.string().optional(),
  campaign_type: z.string().optional(),
  business_problem: z.string().optional(),
  proposition: z.string().optional(),
  insight: z.string().optional(),
  pillar_id: z.string().uuid().nullable().optional(),
  plan_id: z.string().uuid().nullable().optional(),
  status: z
    .enum(["draft", "submitted", "in_review", "changes_requested", "accepted", "rejected", "parked"])
    .optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_briefs")
      .select("*, brand_activity(*)")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return errorResponse("Not found", "NOT_FOUND", 404);
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to fetch brand brief");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const patch = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data: before } = await supabase
      .from("brand_briefs")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    const { data, error } = await supabase
      .from("brand_briefs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .select("*")
      .single();
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.brief_updated",
      entityType: "brand_brief",
      entityId: id,
      risk: patch.status ? "medium" : "low",
      retention: "operational",
      briefId: id,
      before: before ? briefRowToSnapshot(before as Record<string, unknown>) : null,
      after: briefRowToSnapshot(data as Record<string, unknown>),
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update brand brief");
  }
}
