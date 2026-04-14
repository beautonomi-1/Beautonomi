import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  getWasenderConfig,
  sendTextMessage,
  resolveTemplatePlaceholders,
  normalizePhoneForWasender,
} from "@/lib/whatsapp/wasender-client";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { lead_id, session_id, template_id, message } = body;

    if (!lead_id) return errorResponse("lead_id is required", "VALIDATION_ERROR", 400);
    if (!session_id) return errorResponse("session_id is required", "VALIDATION_ERROR", 400);

    const { data: lead } = await supabase
      .from("provider_leads")
      .select("*")
      .eq("id", lead_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!lead) return errorResponse("Lead not found", "NOT_FOUND", 404);
    const leadRow = lead as Record<string, any>;

    if (!leadRow.phone_e164) {
      return errorResponse("Lead has no phone number", "VALIDATION_ERROR", 400);
    }

    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("id, wasender_session_id, status, is_paused, daily_send_count, hourly_send_count")
      .eq("id", session_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!session) return errorResponse("Session not found", "NOT_FOUND", 404);
    const sessionRow = session as Record<string, any>;

    if (sessionRow.status !== "connected") {
      return errorResponse("Session is not connected", "SESSION_NOT_CONNECTED", 400);
    }
    if (sessionRow.is_paused) {
      return errorResponse("Session is paused", "SESSION_PAUSED", 400);
    }

    let messageBody = message?.trim() || "";

    if (template_id && !messageBody) {
      const { data: tpl } = await supabase
        .from("whatsapp_templates")
        .select("body")
        .eq("id", template_id)
        .maybeSingle();
      if (tpl) {
        messageBody = resolveTemplatePlaceholders((tpl as any).body, leadRow);
      }
    } else if (messageBody) {
      messageBody = resolveTemplatePlaceholders(messageBody, leadRow);
    }

    if (!messageBody) {
      return errorResponse("Message body is empty", "VALIDATION_ERROR", 400);
    }

    const config = await getWasenderConfig(tenantId);
    if (!config) return errorResponse("WasenderAPI not configured", "NOT_CONFIGURED", 400);

    const toNumber = normalizePhoneForWasender(leadRow.phone_e164);

    // WasenderAPI per-session calls use the session's API key; for PAT-based sending
    // we route through the session's own token. Here we use the PAT with session context.
    const result = await sendTextMessage(config.baseUrl, config.pat, toNumber, messageBody);

    if (!result.success) {
      return errorResponse(result.message || "Failed to send message", "SEND_FAILED", 502);
    }

    const externalMsgId = result.data?.msgId || result.data?.id || null;

    await supabase.from("provider_lead_communications").insert({
      tenant_id: tenantId,
      lead_id,
      channel: "whatsapp",
      direction: "outbound",
      from_number: sessionRow.phone_number ?? null,
      to_number: toNumber,
      body: messageBody,
      template_id: template_id || null,
      external_message_id: externalMsgId,
      status: "sent",
      sent_by: user.id,
      metadata: { session_id, wasender_msg_id: externalMsgId },
    });

    await supabase.from("provider_lead_activities").insert({
      lead_id,
      activity_type: "whatsapp_sent",
      description: `WhatsApp message sent: "${messageBody.slice(0, 80)}${messageBody.length > 80 ? "..." : ""}"`,
      metadata: { session_id, template_id, external_message_id: externalMsgId },
      performed_by: user.id,
    });

    await supabase
      .from("whatsapp_sessions")
      .update({
        daily_send_count: (sessionRow.daily_send_count || 0) + 1,
        hourly_send_count: (sessionRow.hourly_send_count || 0) + 1,
      })
      .eq("id", session_id);

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.whatsapp.message.sent",
      entity_type: "provider_lead",
      entity_id: lead_id,
      module: "whatsapp",
      risk_level: "low",
      metadata: { session_id, template_id, to_number: toNumber },
      ...extractRequestMeta(request),
    });

    return successResponse({ sent: true, external_message_id: externalMsgId });
  } catch (error) {
    return handleApiError(error, "Failed to send WhatsApp message");
  }
}
