import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { diffBriefFields } from "@/lib/brand-marketing/brief-versions";

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
    const compareA = url.searchParams.get("compare_a");
    const compareB = url.searchParams.get("compare_b");

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_brief_versions")
      .select("id, version_number, content_hash, editor_id, created_at, fields")
      .eq("brief_id", id)
      .eq("tenant_id", access.tenantId)
      .order("version_number", { ascending: false })
      .limit(50);
    if (error) throw error;

    let diff: { changed_fields: string[]; a?: number; b?: number } | null = null;
    if (compareA && compareB) {
      const aNum = Number(compareA);
      const bNum = Number(compareB);
      const va = (data ?? []).find((v) => v.version_number === aNum);
      const vb = (data ?? []).find((v) => v.version_number === bNum);
      if (va && vb) {
        diff = {
          a: aNum,
          b: bNum,
          changed_fields: diffBriefFields(
            (va.fields ?? {}) as Record<string, unknown>,
            (vb.fields ?? {}) as Record<string, unknown>,
          ),
        };
      }
    }

    return successResponse({ items: data ?? [], diff });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to list brief versions");
  }
}
