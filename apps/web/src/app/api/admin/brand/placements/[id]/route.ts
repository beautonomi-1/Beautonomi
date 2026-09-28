import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const patchSchema = z.object({
  channel_key: z.string().optional(),
  line_type: z.string().optional(),
  name: z.string().optional(),
  owner_id: z.string().uuid().optional(),
  budget: z.union([z.coerce.number(), z.null()]).optional(),
  tracking_code: z.string().optional(),
  flight_start: z.string().optional(),
  flight_end: z.string().optional(),
  promotion_id: z.string().uuid().nullable().optional(),
  coupon_id: z.string().uuid().nullable().optional(),
  referral_code: z.string().nullable().optional(),
  referral_program: z.boolean().optional(),
  broadcast_log_id: z.string().uuid().nullable().optional(),
  ads_campaign_id: z.string().uuid().nullable().optional(),
  waitlist_city: z.string().nullable().optional(),
  external_campaign_id: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

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
    const { data: existing } = await supabase
      .from("brand_placements")
      .select("owner_id, campaign_id")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!existing) return errorResponse("Placement not found", "NOT_FOUND", 404);

    const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (!patch.owner_id && !existing.owner_id) update.owner_id = access.user.id;

    const { data, error } = await supabase
      .from("brand_placements")
      .update(update)
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .select("*")
      .single();
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.placement_updated",
      entityType: "brand_placement",
      entityId: id,
      risk: "low",
      retention: "operational",
      campaignId: existing.campaign_id,
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update placement");
  }
}
