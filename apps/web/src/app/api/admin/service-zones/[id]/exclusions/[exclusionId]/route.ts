import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * DELETE /api/admin/service-zones/[id]/exclusions/[exclusionId]
 * Remove an exclusion and recompute zone geometry.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; exclusionId: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: zone_id, exclusionId } = await params;

    const { data: exclusion } = await supabase
      .from("platform_zone_exclusions")
      .select("id, zone_id")
      .eq("id", exclusionId)
      .eq("zone_id", zone_id)
      .single();

    if (!exclusion) return notFoundResponse("Exclusion not found");

    const { error: delError } = await admin
      .from("platform_zone_exclusions")
      .delete()
      .eq("id", exclusionId)
      .eq("zone_id", zone_id);

    if (delError) throw delError;

    const { error: rpcError } = await admin.rpc("update_platform_zone_geometry", { p_zone_id: zone_id });
    if (rpcError) throw rpcError;

    const { data: updated } = await supabase
      .from("platform_zones")
      .select("version")
      .eq("id", zone_id)
      .single();

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id, actor_role: user.role,
      action: "admin.service_zone.exclusion.delete", entity_type: "platform_zone",
      entity_id: zone_id, module: "operations", risk_level: "medium",
      retention_tier: "operational", status: "succeeded",
      ip_address: reqMeta.ip_address, user_agent: reqMeta.user_agent,
    });

    return successResponse({
      removed: true,
      version: (updated as { version?: number } | null)?.version,
    });
  } catch (error) {
    return handleApiError(error, "Failed to remove exclusion");
  }
}
