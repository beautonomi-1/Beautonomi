import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { getWasenderConfig, getSessionQrCode } from "@/lib/whatsapp/wasender-client";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("id, wasender_session_id, status")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!session) return notFoundResponse("Session not found");

    const config = await getWasenderConfig(tenantId);
    if (!config) return errorResponse("WasenderAPI not configured", "NOT_CONFIGURED", 400);

    const qrData = await getSessionQrCode(config, (session as any).wasender_session_id);

    return successResponse(qrData);
  } catch (error) {
    return handleApiError(error, "Failed to get QR code");
  }
}
