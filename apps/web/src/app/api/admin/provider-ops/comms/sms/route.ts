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

    // Get platform Twilio credentials from platform_settings
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
    const fromNumber =
      (twilioConfig?.twilio_sms_from as string) ||
      process.env.TWILIO_SMS_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      const { errorResponse } = await import("@/lib/supabase/api-helpers");
      return errorResponse(
        "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM.",
        "CONFIGURATION_ERROR",
        503
      );
    }

    // Send SMS via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: to,
      From: fromNumber,
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
        (twilioData.message as string) || "Failed to send SMS via Twilio"
      );
    }

    // Log the communication
    await supabase.from("provider_lead_communications").insert({
      tenant_id: tenantId,
      lead_id: lead_id || null,
      provider_id: provider_id || null,
      user_id: user_id || null,
      channel: "sms",
      direction: "outbound",
      from_number: fromNumber,
      to_number: to,
      body: messageBody.trim(),
      external_message_id: (twilioData.sid as string) || null,
      status: (twilioData.status as string) || "sent",
      metadata: { twilio_response: twilioData },
      sent_by: user.id,
    });

    // Log activity if lead_id provided
    if (lead_id) {
      await supabase.from("provider_lead_activities").insert({
        lead_id,
        activity_type: "sms_sent",
        description: `SMS sent to ${to}`,
        metadata: { message_sid: twilioData.sid, to },
        performed_by: user.id,
      });
    }

    return successResponse({
      message_sid: twilioData.sid,
      status: twilioData.status,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send SMS");
  }
}
