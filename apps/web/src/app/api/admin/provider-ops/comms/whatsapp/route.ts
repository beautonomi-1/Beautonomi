import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { resolveTwilioCredentials, sendTwilioWhatsApp } from "@/lib/integrations/twilio";

/**
 * POST /api/admin/provider-ops/comms/whatsapp
 * Send an outbound WhatsApp message via Twilio.
 * Credentials resolved from platform_secrets (DB) or env vars.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { to, body: messageBody, lead_id, provider_id, user_id } = body;

    if (!to || !messageBody?.trim()) {
      return errorResponse("to and body are required", "VALIDATION_ERROR", 400);
    }

    const creds = await resolveTwilioCredentials(supabase, tenantId);
    if (!creds || !creds.whatsappFrom) {
      return errorResponse(
        "Twilio WhatsApp not configured. Add Twilio credentials in Admin Settings → Integrations → Twilio.",
        "CONFIGURATION_ERROR",
        503
      );
    }

    const twilioData = await sendTwilioWhatsApp(creds, to, messageBody.trim());

    const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const whatsappFrom = creds.whatsappFrom.startsWith("whatsapp:")
      ? creds.whatsappFrom
      : `whatsapp:${creds.whatsappFrom}`;

    await supabase.from("provider_lead_communications").insert({
      tenant_id: tenantId,
      lead_id: lead_id || null,
      provider_id: provider_id || null,
      user_id: user_id || null,
      channel: "whatsapp",
      direction: "outbound",
      from_number: whatsappFrom,
      to_number: whatsappTo,
      body: messageBody.trim(),
      external_message_id: (twilioData.sid as string) || null,
      status: (twilioData.status as string) || "sent",
      metadata: { twilio_response: twilioData },
      sent_by: user.id,
    });

    if (lead_id) {
      await supabase.from("provider_lead_activities").insert({
        lead_id,
        activity_type: "whatsapp_sent",
        description: `WhatsApp sent to ${to}`,
        metadata: { message_sid: twilioData.sid, to },
        performed_by: user.id,
      });
    }

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.provider_ops.whatsapp_sent",
      entity_type: "provider_lead_communication",
      module: "provider_ops",
      risk_level: "medium",
      retention_tier: "routine",
      metadata: { to, lead_id: lead_id || null, message_sid: twilioData.sid },
      ...extractRequestMeta(request),
    });

    return successResponse({
      message_sid: twilioData.sid,
      status: twilioData.status,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send WhatsApp");
  }
}
