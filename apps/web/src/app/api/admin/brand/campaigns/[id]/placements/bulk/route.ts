import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const bodySchema = z.object({
  action: z.enum(["apply_campaign_dates", "split_budget_even", "assign_owner"]),
  placement_ids: z.array(z.string().uuid()).min(1),
  owner_id: z.string().uuid().optional(),
  envelope: z.coerce.number().optional(),
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

    const body = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: campaign } = await supabase
      .from("brand_campaigns")
      .select("flight_start, flight_end, budget_envelope")
      .eq("id", campaignId)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!campaign) return errorResponse("Campaign not found", "NOT_FOUND", 404);

    const ids = body.placement_ids;
    if (body.action === "apply_campaign_dates") {
      await supabase
        .from("brand_placements")
        .update({
          flight_start: campaign.flight_start,
          flight_end: campaign.flight_end,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("campaign_id", campaignId)
        .eq("tenant_id", access.tenantId);
    }

    if (body.action === "assign_owner" && body.owner_id) {
      await supabase
        .from("brand_placements")
        .update({ owner_id: body.owner_id, updated_at: new Date().toISOString() })
        .in("id", ids)
        .eq("campaign_id", campaignId)
        .eq("tenant_id", access.tenantId);
    }

    if (body.action === "split_budget_even") {
      const envelope = body.envelope ?? Number(campaign.budget_envelope ?? 0);
      const each = ids.length ? envelope / ids.length : 0;
      for (const pid of ids) {
        await supabase
          .from("brand_placements")
          .update({ budget: each, updated_at: new Date().toISOString() })
          .eq("id", pid)
          .eq("tenant_id", access.tenantId);
      }
    }

    await auditBrandMutation(request, supabase, access, {
      action: `brand.placements_bulk_${body.action}`,
      entityType: "brand_campaign",
      entityId: campaignId,
      risk: "low",
      retention: "operational",
      campaignId,
      meta: { placement_ids: ids },
    });

    return successResponse({ ok: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed bulk placement update");
  }
}
