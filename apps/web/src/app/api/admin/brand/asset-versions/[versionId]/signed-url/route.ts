import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { BRAND_ASSETS_BUCKET } from "@/lib/brand-marketing/assets";

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
    const { data: version, error } = await supabase
      .from("brand_asset_versions")
      .select("storage_path, mime_type, tenant_id")
      .eq("id", versionId)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!version) return errorResponse("Not found", "NOT_FOUND", 404);

    const { data: signed, error: sErr } = await supabase.storage
      .from(BRAND_ASSETS_BUCKET)
      .createSignedUrl(version.storage_path, 3600);
    if (sErr) throw sErr;

    return successResponse({ signed_url: signed?.signedUrl ?? null, mime_type: version.mime_type });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to sign asset URL");
  }
}
