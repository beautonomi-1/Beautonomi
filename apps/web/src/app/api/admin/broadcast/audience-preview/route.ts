import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  resolveBroadcastCustomerUserIds,
  resolveBroadcastProviderUserIds,
} from "@/lib/admin/broadcast-recipient-resolution";

/**
 * GET /api/admin/broadcast/audience-preview?segment=customers|providers
 * Returns estimated recipient count before sending a broadcast (marketing comms).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) throw new Error("Authentication required");

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const segment = (searchParams.get("segment") ?? "customers").toLowerCase();

    if (segment === "providers") {
      const resolved = await resolveBroadcastProviderUserIds(supabase, tenantId);
      return successResponse({
        count: resolved.userIds.length,
        mode: resolved.mode,
      });
    }

    const resolved = await resolveBroadcastCustomerUserIds(supabase, tenantId);
    return successResponse({
      count: resolved.userIds.length,
      mode: resolved.mode,
    });
  } catch (error) {
    return handleApiError(error, "Failed to preview audience");
  }
}
