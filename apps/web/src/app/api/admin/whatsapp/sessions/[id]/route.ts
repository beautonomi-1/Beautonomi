import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { getWasenderConfig, deleteSession as wasenderDeleteSession } from "@/lib/whatsapp/wasender-client";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFoundResponse("Session not found");

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch session");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("id, wasender_session_id, name")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!session) return notFoundResponse("Session not found");

    const config = await getWasenderConfig(tenantId);
    if (config) {
      try {
        await wasenderDeleteSession(config, (session as any).wasender_session_id);
      } catch {
        // Best-effort remote deletion
      }
    }

    const { error } = await supabase.from("whatsapp_sessions").delete().eq("id", id);
    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.whatsapp.session.deleted",
      entity_type: "whatsapp_session",
      entity_id: id,
      module: "whatsapp",
      risk_level: "high",
      metadata: { name: (session as any).name },
      ...extractRequestMeta(request),
    });

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete session");
  }
}
