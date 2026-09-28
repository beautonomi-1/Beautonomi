import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { computeCampaignReadiness } from "@/lib/brand-marketing/readiness";
import type { BrandCampaignStage } from "@/lib/brand-marketing/types";
import { nextStage } from "@/lib/brand-marketing/stage-gates";

const querySchema = z.object({
  target: z.enum(["planning", "creative", "live", "measuring", "closed"]).optional(),
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

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ target: url.searchParams.get("target") ?? undefined });
    const target = parsed.success ? parsed.data.target : undefined;

    const supabase = getSupabaseAdmin();
    let targetStage = target as BrandCampaignStage | undefined;
    if (!targetStage) {
      const { data: row } = await supabase
        .from("brand_campaigns")
        .select("stage")
        .eq("id", id)
        .eq("tenant_id", access.tenantId)
        .maybeSingle();
      if (!row) return errorResponse("Not found", "NOT_FOUND", 404);
      targetStage = nextStage(row.stage as BrandCampaignStage) ?? (row.stage as BrandCampaignStage);
    }

    const result = await computeCampaignReadiness(supabase, access.tenantId, id, targetStage);
    if (!result) return errorResponse("Not found", "NOT_FOUND", 404);
    return successResponse(result);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load readiness");
  }
}
