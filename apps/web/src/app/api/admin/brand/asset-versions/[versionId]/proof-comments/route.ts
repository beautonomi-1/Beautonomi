import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const postSchema = z.object({
  body: z.string().min(1).max(4000),
  pos_x: z.number().min(0).max(1).optional(),
  pos_y: z.number().min(0).max(1).optional(),
  timecode_sec: z.number().min(0).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_proof_comments")
      .select("*")
      .eq("version_id", versionId)
      .eq("tenant_id", access.tenantId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return successResponse({ items: data ?? [] });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to list proof comments");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = postSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: version } = await supabase
      .from("brand_asset_versions")
      .select("id, asset_id")
      .eq("id", versionId)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!version) return errorResponse("Version not found", "NOT_FOUND", 404);

    const { data: asset } = await supabase
      .from("brand_assets")
      .select("campaign_id")
      .eq("id", version.asset_id)
      .maybeSingle();

    const { data: row, error } = await supabase
      .from("brand_proof_comments")
      .insert({
        tenant_id: access.tenantId,
        version_id: versionId,
        author_id: access.user.id,
        body: body.body,
        pos_x: body.pos_x ?? null,
        pos_y: body.pos_y ?? null,
        timecode_sec: body.timecode_sec ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;

    await auditBrandMutation(request, supabase, access, {
      action: "brand.proof_comment_added",
      entityType: "brand_proof_comment",
      entityId: row.id,
      risk: "low",
      retention: "operational",
      campaignId: asset?.campaign_id ?? null,
      after: row as unknown as Record<string, unknown>,
    });

    return successResponse(row);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to add proof comment");
  }
}
