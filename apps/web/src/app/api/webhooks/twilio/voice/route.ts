import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveTwilioVoiceCredentials,
  resolveTwilioWebhookAuthToken,
  validateTwilioWebhookSignature,
  voiceStatusCallbackUrl,
} from "@/lib/integrations/twilio";
import {
  getCallsIntegrationConfig,
  getGlobalCallsIntegrationConfig,
  isTwilioVoiceEnabled,
} from "@/lib/integrations/calls-config";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * POST /api/webhooks/twilio/voice
 *
 * TwiML for outbound Voice SDK calls: dial the lead with platform caller ID.
 */
export async function POST(request: NextRequest) {
  try {
    const twilioSignature = request.headers.get("x-twilio-signature") || "";
    const body = await request.text();
    const params = new URLSearchParams(body);

    const to = (params.get("To") || params.get("to") || "").trim();
    const leadId = (params.get("lead_id") || params.get("LeadId") || "").trim();
    const tenantId = (params.get("tenant_id") || params.get("TenantId") || "").trim();
    const adminId = (params.get("From") || params.get("from") || "").trim();

    const supabase = getSupabaseAdmin();

    const authToken = await resolveTwilioWebhookAuthToken(supabase, tenantId);
    if (!authToken) {
      console.error("Twilio auth token not configured — rejecting voice webhook");
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com"}/api/webhooks/twilio/voice`;
    if (!validateTwilioWebhookSignature(authToken, twilioSignature, url, params)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (!to) {
      return twimlResponse(
        '<Say voice="alice">No destination number was provided.</Say>',
      );
    }

    const callsStatus = tenantId
      ? await getCallsIntegrationConfig(supabase, tenantId)
      : {
          config: await getGlobalCallsIntegrationConfig(supabase),
          twilioVoiceConfigured: false,
        };
    if (!isTwilioVoiceEnabled(callsStatus)) {
      return twimlResponse(
        '<Say voice="alice">Voice calling is disabled.</Say>',
      );
    }

    const voiceCreds = await resolveTwilioVoiceCredentials(supabase, tenantId || "");
    const callerId = voiceCreds?.voiceFrom || process.env.TWILIO_VOICE_FROM || "";

    if (!callerId) {
      return twimlResponse(
        '<Say voice="alice">Voice calling is not configured.</Say>',
      );
    }

    if (leadId && tenantId) {
      const { data: lead } = await supabase
        .from("provider_leads")
        .select("id, do_not_contact, deleted_at")
        .eq("id", leadId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!lead || lead.deleted_at) {
        return twimlResponse(
          '<Say voice="alice">This lead is no longer available.</Say>',
        );
      }
      if (lead.do_not_contact) {
        return twimlResponse(
          '<Say voice="alice">This lead is marked do not contact.</Say>',
        );
      }
    }

    const statusCallback =
      leadId && tenantId && adminId
        ? voiceStatusCallbackUrl(leadId, tenantId, adminId)
        : `${(process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(/\/$/, "")}/api/webhooks/twilio/voice/status`;

    const twiml = [
      "<Dial",
      `callerId="${escapeXml(callerId)}"`,
      `statusCallback="${escapeXml(statusCallback)}"`,
      'statusCallbackEvent="initiated ringing answered completed"',
      'statusCallbackMethod="POST"',
      ">",
      `<Number>${escapeXml(to)}</Number>`,
      "</Dial>",
    ].join(" ");

    return twimlResponse(twiml);
  } catch (e) {
    console.error("Twilio voice TwiML error:", e);
    return twimlResponse('<Say voice="alice">An error occurred.</Say>');
  }
}

function twimlResponse(inner: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
