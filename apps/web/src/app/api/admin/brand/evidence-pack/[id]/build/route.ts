import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { assembleBrandEvidencePack } from "@/lib/brand-marketing/evidence-pack-build";
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
    const { data: pack } = await supabase
      .from("brand_evidence_packs")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!pack) return errorResponse("Not found", "NOT_FOUND", 404);

    const built = await assembleBrandEvidencePack(supabase, id);

    await auditBrandMutation(request, supabase, access, {
      action: "brand.evidence_pack_built",
      entityType: "brand_evidence_pack",
      entityId: id,
      risk: "medium",
      retention: "financial",
      campaignId: pack.campaign_id,
      after: built as unknown as Record<string, unknown>,
    });

    const { data: updated } = await supabase
      .from("brand_evidence_packs")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse(updated ?? { ...pack, status: "ready", ...built });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to build evidence pack");
  }
}
