import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { suggestTrackingCode } from "@/lib/brand-marketing/codes";
import { loadTenantSlug } from "@/lib/brand-marketing/tenant";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

export async function POST(
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
    const { data: source, error } = await supabase
      .from("brand_campaigns")
      .select("*, brand_placements(*)")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (error || !source) return errorResponse("Not found", "NOT_FOUND", 404);

    const slug = await loadTenantSlug(supabase, access.tenantId);
    let code = suggestTrackingCode(`${source.name}-copy`, slug);
    const { data: clash } = await supabase.from("brand_campaigns").select("id").ilike("tracking_code", code).maybeSingle();
    if (clash) code = `${code}-${Date.now().toString(36).slice(-4)}`;

    const { data: created, error: insErr } = await supabase
      .from("brand_campaigns")
      .insert({
        tenant_id: access.tenantId,
        name: `${source.name} (copy)`,
        objective: source.objective,
        stage: "planning",
        owner_id: access.user.id,
        tracking_code: code,
        group_code: source.group_code,
        budget_envelope: source.budget_envelope,
        flight_start: source.flight_start,
        flight_end: source.flight_end,
        line_mix: source.line_mix,
        success_metric: source.success_metric,
        success_target: source.success_target,
        audience_definition: source.audience_definition,
        cloned_from_id: source.id,
      })
      .select("*")
      .single();
    if (insErr || !created) throw insErr ?? new Error("Clone failed");

    const placements = source.brand_placements ?? [];
    if (placements.length) {
      const { error: plErr } = await supabase.from("brand_placements").insert(
        placements.map((p: Record<string, unknown>) => ({
          tenant_id: access.tenantId,
          campaign_id: created.id,
          channel_key: p.channel_key,
          line_type: p.line_type,
          name: p.name,
          budget: p.budget,
          tracking_code: code,
          flight_start: p.flight_start,
          flight_end: p.flight_end,
          owner_id: access.user.id,
          promotion_id: p.promotion_id ?? null,
          coupon_id: p.coupon_id ?? null,
          referral_code: p.referral_code ?? null,
          referral_program: p.referral_program ?? false,
          broadcast_log_id: p.broadcast_log_id ?? null,
          ads_campaign_id: p.ads_campaign_id ?? null,
          waitlist_city: p.waitlist_city ?? null,
          waitlist_persona: p.waitlist_persona ?? null,
          external_campaign_id: p.external_campaign_id ?? null,
          payload: p.payload ?? {},
        })),
      );
      if (plErr) throw plErr;
    }

    await auditBrandMutation(request, supabase, access, {
      action: "brand.campaign_cloned",
      entityType: "brand_campaign",
      entityId: created.id,
      risk: "medium",
      retention: "operational",
      campaignId: created.id,
      meta: { cloned_from_id: id },
    });

    return successResponse(created);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to clone campaign");
  }
}
