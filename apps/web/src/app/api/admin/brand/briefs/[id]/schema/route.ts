import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { loadBrandSettings } from "@/lib/brand-marketing/settings";
import {
  computeBriefQualityScore,
  resolveBriefSchema,
  type CampaignTypeKey,
} from "@/lib/brand-marketing/brief-schema";
import { briefRowToSnapshot } from "@/lib/brand-marketing/brief-versions";

function flatBriefValues(row: Record<string, unknown>): Record<string, unknown> {
  const base = briefRowToSnapshot(row);
  const fields = row.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    return { ...base, ...(fields as Record<string, unknown>) };
  }
  return base;
}

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
    const { data: brief, error } = await supabase
      .from("brand_briefs")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!brief) return errorResponse("Not found", "NOT_FOUND", 404);

    const settings = await loadBrandSettings(supabase, access.tenantId);
    const campaign_type = (brief.campaign_type ?? "brand_awareness") as CampaignTypeKey;
    const channels = Array.isArray(brief.channels_requested) ? (brief.channels_requested as string[]) : [];
    const sections = resolveBriefSchema({
      campaign_type,
      channels_requested: channels,
      budget_envelope: brief.budget_envelope,
      success_metric: brief.success_metric === "supply" ? "supply" : "demand",
      go_live_budget_threshold: settings.go_live_budget_threshold,
    });

    const values = flatBriefValues(brief as Record<string, unknown>);
    const quality_score = computeBriefQualityScore(values, sections);
    const missing_required: string[] = [];
    for (const section of sections) {
      for (const f of section.fields) {
        if (f.tier !== "required") continue;
        const v = values[f.key];
        if (v == null || String(v).trim() === "") missing_required.push(f.label);
      }
    }

    return successResponse({ sections, quality_score, missing_required });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to resolve brief schema");
  }
}
