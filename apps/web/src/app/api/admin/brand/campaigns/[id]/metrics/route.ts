import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { resolveUtcPeriod } from "@/lib/brand-marketing/periods";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const url = new URL(request.url);
    const preset = (url.searchParams.get("period") ?? "this_quarter") as Parameters<
      typeof resolveUtcPeriod
    >[0];
    const period = resolveUtcPeriod(preset);

    const supabase = getSupabaseAdmin();
    const { data: campaign } = await supabase
      .from("brand_campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!campaign) return errorResponse("Not found", "NOT_FOUND", 404);

    const { data: placements } = await supabase
      .from("brand_placements")
      .select("id, name, channel_key")
      .eq("campaign_id", campaignId)
      .eq("tenant_id", access.tenantId);

    const placementIds = (placements ?? []).map((p) => p.id);
    if (placementIds.length === 0) {
      return successResponse({ items: [], placements: [], period });
    }

    const { data: entries, error } = await supabase
      .from("brand_metric_entries")
      .select("*")
      .eq("tenant_id", access.tenantId)
      .in("placement_id", placementIds)
      .gte("as_of", period.start.toISOString().slice(0, 10))
      .lte("as_of", period.end.toISOString().slice(0, 10))
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const nameByPlacement = new Map((placements ?? []).map((p) => [p.id, p.name ?? p.channel_key]));

    return successResponse({
      period,
      items: (entries ?? []).map((e) => ({
        ...e,
        placement_name: nameByPlacement.get(e.placement_id) ?? e.placement_id,
      })),
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to list campaign metrics");
  }
}
