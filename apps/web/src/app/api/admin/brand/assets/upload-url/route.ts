import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import {
  BRAND_ASSETS_BUCKET,
  BRAND_ASSET_MAX_BYTES,
  BRAND_ASSET_MIME_TYPES,
  SHA256_HEX,
  brandAssetObjectPath,
  mimeToExt,
} from "@/lib/brand-marketing/assets";

const schema = z.object({
  campaign_id: z.string().uuid(),
  asset_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  sha256: z.string().regex(SHA256_HEX),
  size_bytes: z.number().int().min(1).max(BRAND_ASSET_MAX_BYTES),
  mime_type: z
    .string()
    .refine((m) => (BRAND_ASSET_MIME_TYPES as readonly string[]).includes(m), "Unsupported file type"),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = schema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: campaign } = await supabase
      .from("brand_campaigns")
      .select("id")
      .eq("id", body.campaign_id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!campaign) return errorResponse("Campaign not found", "NOT_FOUND", 404);

    let assetId = body.asset_id;
    if (!assetId) {
      const { data: created, error: cErr } = await supabase
        .from("brand_assets")
        .insert({
          tenant_id: access.tenantId,
          campaign_id: body.campaign_id,
          name: body.name ?? "Untitled asset",
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      assetId = created.id;
      await auditBrandMutation(request, supabase, access, {
        action: "brand.asset_created",
        entityType: "brand_asset",
        entityId: assetId,
        risk: "low",
        retention: "operational",
        campaignId: body.campaign_id,
        meta: { name: body.name ?? "Untitled asset" },
      });
    }

    const ext = mimeToExt(body.mime_type);
    const path = brandAssetObjectPath(access.tenantId, assetId, body.sha256, ext);
    const storage = supabase.storage.from(BRAND_ASSETS_BUCKET);
    const folder = path.slice(0, path.lastIndexOf("/"));
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    const { data: existing } = await storage.list(folder, { search: fileName, limit: 1 });
    if (existing?.some((o) => o.name === fileName)) {
      return successResponse({ asset_id: assetId, path, exists: true, signed_url: null, token: null });
    }

    const { data, error } = await storage.createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Could not create upload URL");
    return successResponse({
      asset_id: assetId,
      path,
      exists: false,
      signed_url: data.signedUrl,
      token: data.token,
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create brand asset upload URL");
  }
}
