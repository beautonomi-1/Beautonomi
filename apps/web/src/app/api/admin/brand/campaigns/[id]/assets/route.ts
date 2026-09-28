import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { BRAND_ASSETS_BUCKET } from "@/lib/brand-marketing/assets";

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

    const supabase = getSupabaseAdmin();
    const { data: assets, error } = await supabase
      .from("brand_assets")
      .select("*, brand_asset_versions(id, version_number, storage_path, sha256, mime_type, size_bytes, created_at)")
      .eq("campaign_id", campaignId)
      .eq("tenant_id", access.tenantId)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const storage = supabase.storage.from(BRAND_ASSETS_BUCKET);
    const items = await Promise.all(
      (assets ?? []).map(async (a) => {
        const versions = (a.brand_asset_versions ?? []) as Array<{
          id: string;
          version_number: number;
          storage_path: string;
          mime_type: string;
          brand_proof_comments?: unknown[];
        }>;
        versions.sort((x, y) => y.version_number - x.version_number);
        const latest = versions[0];
        let preview_url: string | null = null;
        if (latest?.storage_path && latest.mime_type.startsWith("image/")) {
          const { data: signed } = await storage.createSignedUrl(latest.storage_path, 3600);
          preview_url = signed?.signedUrl ?? null;
        }
        return { ...a, brand_asset_versions: versions, preview_url };
      }),
    );

    return successResponse({ items });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to list campaign assets");
  }
}
