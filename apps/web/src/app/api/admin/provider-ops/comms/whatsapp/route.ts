import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { to, body: messageBody, lead_id, provider_id, user_id } = body;

    if (!to || !messageBody?.trim()) {
      const { errorResponse } = await import("@/lib/supabase/api-helpers");
      return errorResponse("to and body are required", "VALIDATION_ERROR", 400);
    }

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const twilioConfig = (settings?.settings as Record<string, unknown>)
      ?.integrations as Record<string, unknown> | undefined;
    const accountSid =
      (twilioConfig?.twilio_account_sid as string) ||
      process.env.TWILIO_ACCOUNT_SID;
    const authToken =
      (twilioConfig?.twilio_auth_token as string) ||
      process.env.TWILIO_AUTH_TOKEN;
    const fromWhatsApp =
      (twilioConfig?.twilio_whatsapp_from as string) ||
      process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !fromWhatsApp) {
      const { errorResponse } = await import("@/lib/supabase/api-helpers");
      return errorResponse(
        "Twilio WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.",
        "CONFIGURATION_ERROR",
        503
      );
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const whatsappFrom = fromWhatsApp.startsWith("whatsapp:")
      ? fromWhatsApp
      : `whatsapp:${fromWhatsApp}`;

    const params = new URLSearchParams({
      To: whatsappTo,
      From: whatsappFrom,
      Body: messageBody.trim(),
    });

    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const twilioData = (await twilioRes.json()) as Record<string, unknown>;

    if (!twilioRes.ok) {
      throw new Error(
        (twilioData.message as string) || "Failed to send WhatsApp via Twilio"
      );
    }

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

    return successResponse({
      message_sid: twilioData.sid,
      status: twilioData.status,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send WhatsApp");
  }
}
