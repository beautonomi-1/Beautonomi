import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { getWasenderConfig, createSession as wasenderCreateSession } from "@/lib/whatsapp/wasender-client";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data, error } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch WhatsApp sessions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    if (!body.name?.trim()) {
      return errorResponse("Session name is required", "VALIDATION_ERROR", 400);
    }

    const config = await getWasenderConfig(tenantId);
    if (!config) {
      return errorResponse("WasenderAPI not configured. Add your API key in Integrations first.", "NOT_CONFIGURED", 400);
    }

    const wasenderSession = await wasenderCreateSession(config, body.name.trim());
    const wasenderSessionId = String(
      (wasenderSession as any).id ?? (wasenderSession as any).session_id ?? (wasenderSession as any).data?.id ?? "",
    );

    if (!wasenderSessionId) {
      return errorResponse("Failed to create session on WasenderAPI", "EXTERNAL_ERROR", 502);
    }

    const { data, error } = await supabase
      .from("whatsapp_sessions")
      .insert({
        tenant_id: tenantId,
        wasender_session_id: wasenderSessionId,
        name: body.name.trim(),
        status: "disconnected",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.whatsapp.session.created",
      entity_type: "whatsapp_session",
      entity_id: data.id,
      module: "whatsapp",
      risk_level: "medium",
      metadata: { wasender_session_id: wasenderSessionId, name: body.name },
      ...extractRequestMeta(request),
    });

    return successResponse(data, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create WhatsApp session");
  }
}
