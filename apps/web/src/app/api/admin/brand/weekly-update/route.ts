import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const saveSchema = z.object({
  rows: z.array(
    z.object({
      placement_id: z.string().uuid(),
      spend: z.coerce.number().optional(),
      impressions: z.coerce.number().optional(),
      clicks: z.coerce.number().optional(),
      reach: z.coerce.number().optional(),
      as_of: z.string(),
    }),
  ),
});

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const { data: campaigns } = await supabase
      .from("brand_campaigns")
      .select("id, name, stage")
      .eq("tenant_id", access.tenantId)
      .in("stage", ["live", "measuring"]);

    const campaignIds = (campaigns ?? []).map((c) => c.id);
    if (campaignIds.length === 0) return successResponse({ rows: [] });

    const { data: placements } = await supabase
      .from("brand_placements")
      .select("id, name, channel_key, campaign_id, line_type, last_metric_at")
      .eq("tenant_id", access.tenantId)
      .in("campaign_id", campaignIds)
      .in("line_type", ["paid", "influencer", "sponsorship", "event", "offline"]);

    const nameByCampaign = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

    return successResponse({
      rows: (placements ?? []).map((p) => ({
        ...p,
        campaign_name: nameByCampaign.get(p.campaign_id) ?? "",
      })),
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load weekly update rows");
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { rows } = saveSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const entries: Record<string, unknown>[] = [];

    for (const row of rows) {
      const asOf = row.as_of.slice(0, 10);
      if (row.spend != null) {
        entries.push({
          tenant_id: access.tenantId,
          placement_id: row.placement_id,
          metric_key: "spend",
          value: row.spend,
          unit: "currency",
          as_of: asOf,
          source: "entered",
          confidence: "entered",
          author_id: access.user.id,
        });
      }
      if (row.impressions != null) {
        entries.push({
          tenant_id: access.tenantId,
          placement_id: row.placement_id,
          metric_key: "impressions",
          value: row.impressions,
          unit: "count",
          as_of: asOf,
          source: "entered",
          confidence: "entered",
          author_id: access.user.id,
        });
      }
      if (row.clicks != null) {
        entries.push({
          tenant_id: access.tenantId,
          placement_id: row.placement_id,
          metric_key: "clicks",
          value: row.clicks,
          unit: "count",
          as_of: asOf,
          source: "entered",
          confidence: "entered",
          author_id: access.user.id,
        });
      }
      if (row.reach != null) {
        entries.push({
          tenant_id: access.tenantId,
          placement_id: row.placement_id,
          metric_key: "reach",
          value: row.reach,
          unit: "count",
          as_of: asOf,
          source: "entered",
          confidence: "estimated",
          author_id: access.user.id,
        });
      }
    }

    if (entries.length) {
      await supabase.from("brand_metric_entries").insert(entries);
      const placementIds = [...new Set(rows.map((r) => r.placement_id))];
      await supabase
        .from("brand_placements")
        .update({ last_metric_at: new Date().toISOString() })
        .in("id", placementIds);
      await auditBrandMutation(request, supabase, access, {
        action: "brand.weekly_update_saved",
        entityType: "brand_metric_entry",
        entityId: placementIds[0] ?? access.tenantId,
        risk: "medium",
        retention: "financial",
        meta: { entry_count: entries.length, placement_ids: placementIds },
      });
    }

    return successResponse({ saved: entries.length });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to save weekly update");
  }
}
