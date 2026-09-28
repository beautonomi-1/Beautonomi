import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { BRAND_ASSETS_BUCKET, SHA256_HEX } from "@/lib/brand-marketing/assets";

const schema = z.object({
  asset_id: z.string().uuid(),
  storage_path: z.string().min(1),
  sha256: z.string().regex(SHA256_HEX),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = schema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: asset } = await supabase
      .from("brand_assets")
      .select("id, campaign_id, tenant_id")
      .eq("id", body.asset_id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!asset) return errorResponse("Asset not found", "NOT_FOUND", 404);

    const { data: blob, error: dlErr } = await supabase.storage.from(BRAND_ASSETS_BUCKET).download(body.storage_path);
    if (dlErr || !blob) return errorResponse("Upload not found in storage", "NOT_FOUND", 404);
    const buf = Buffer.from(await blob.arrayBuffer());
    const hash = createHash("sha256").update(buf).digest("hex");
    if (hash !== body.sha256) {
      return errorResponse("File hash mismatch", "HASH_MISMATCH", 400);
    }

    const { data: last } = await supabase
      .from("brand_asset_versions")
      .select("version_number")
      .eq("asset_id", body.asset_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version_number = (last?.version_number ?? 0) + 1;

    const { data: version, error } = await supabase
      .from("brand_asset_versions")
      .insert({
        tenant_id: access.tenantId,
        asset_id: body.asset_id,
        version_number,
        storage_path: body.storage_path,
        sha256: body.sha256,
        mime_type: body.mime_type,
        size_bytes: body.size_bytes,
        uploaded_by: access.user.id,
      })
      .select("*")
      .single();
    if (error) throw error;

    await auditBrandMutation(request, supabase, access, {
      action: "brand.asset_version_created",
      entityType: "brand_asset_version",
      entityId: version.id,
      risk: "medium",
      retention: "operational",
      campaignId: asset.campaign_id,
      after: version as unknown as Record<string, unknown>,
    });

    return successResponse({ version, asset_id: body.asset_id });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to confirm brand asset upload");
  }
}
