import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const createSchema = z.object({
  channel_key: z.string().min(1),
  line_type: z.string().default("paid"),
  name: z.string().optional(),
  budget: z.coerce.number().optional(),
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = createSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: campaign } = await supabase
      .from("brand_campaigns")
      .select("tracking_code")
      .eq("id", campaignId)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!campaign) return errorResponse("Campaign not found", "NOT_FOUND", 404);

    const { data, error } = await supabase
      .from("brand_placements")
      .insert({
        tenant_id: access.tenantId,
        campaign_id: campaignId,
        channel_key: body.channel_key,
        line_type: body.line_type,
        name: body.name,
        budget: body.budget,
        tracking_code: body.tracking_code ?? campaign.tracking_code,
        flight_start: body.flight_start,
        flight_end: body.flight_end,
        promotion_id: body.promotion_id ?? null,
        coupon_id: body.coupon_id ?? null,
        referral_code: body.referral_code ?? null,
        referral_program: body.referral_program ?? false,
        broadcast_log_id: body.broadcast_log_id ?? null,
        ads_campaign_id: body.ads_campaign_id ?? null,
        waitlist_city: body.waitlist_city ?? null,
        external_campaign_id: body.external_campaign_id ?? null,
        owner_id: access.user.id,
        payload: body.payload ?? {},
      })
      .select("*")
      .single();
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.placement_created",
      entityType: "brand_placement",
      entityId: data.id,
      risk: "low",
      retention: "operational",
      campaignId,
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create placement");
  }
}
