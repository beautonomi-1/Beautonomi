import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";

/**
 * DELETE /api/admin/service-zones/[id]/inclusions/[inclusionId]
 * Remove one inclusion row and recompute zone geometry.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inclusionId: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: zone_id, inclusionId } = await params;

    const { data: row, error: findErr } = await admin
      .from("platform_zone_inclusions")
      .select("id")
      .eq("id", inclusionId)
      .eq("zone_id", zone_id)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!row) return notFoundResponse("Inclusion not found");

    const { error: delErr } = await admin
      .from("platform_zone_inclusions")
      .delete()
      .eq("id", inclusionId)
      .eq("zone_id", zone_id);

    if (delErr) throw delErr;

    const { error: rpcError } = await admin.rpc("update_platform_zone_geometry", { p_zone_id: zone_id });
    if (rpcError) throw rpcError;

    const { data: updated } = await supabase
      .from("platform_zones")
      .select("version, geometry")
      .eq("id", zone_id)
      .single();

    type UpdatedRow = { version?: number; geometry?: unknown };
    const updatedRow = updated as UpdatedRow | null;
    return successResponse({
      removed: true,
      version: updatedRow?.version,
      has_geometry: !!updatedRow?.geometry,
    });
  } catch (error) {
    return handleApiError(error, "Failed to remove inclusion");
  }
}
