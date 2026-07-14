import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveTwilioCredentials,
  resolveTwilioVoiceCredentials,
  resolveTwilioWebhookAuthToken,
  validateTwilioWebhookSignature,
} from "@/lib/integrations/twilio";
import {
  getCallsIntegrationConfig,
  getGlobalCallsIntegrationConfig,
  isTwilioVoiceEnabled,
} from "@/lib/integrations/calls-config";

const TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function outcomeFromStatus(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no_answer";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return status;
  }
}

/**
 * POST /api/webhooks/twilio/voice/status
 *
 * Twilio Dial status callbacks — logs completed calls to comms + activities.
 */
export async function POST(request: NextRequest) {
  try {
    const twilioSignature = request.headers.get("x-twilio-signature") || "";
    const body = await request.text();
    const params = new URLSearchParams(body);

    const leadId =
      request.nextUrl.searchParams.get("lead_id") ||
      params.get("lead_id") ||
      "";
    const tenantId =
      request.nextUrl.searchParams.get("tenant_id") ||
      params.get("tenant_id") ||
      "";
    const adminId =
      request.nextUrl.searchParams.get("admin_id") ||
      params.get("admin_id") ||
      "";

    const supabase = getSupabaseAdmin();

    const authToken = await resolveTwilioWebhookAuthToken(supabase, tenantId);
    if (!authToken) {
      console.error("Twilio auth token not configured — rejecting voice status webhook");
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com"}${request.nextUrl.pathname}${request.nextUrl.search}`;
    if (!validateTwilioWebhookSignature(authToken, twilioSignature, url, params)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const callSid = params.get("CallSid") || params.get("ParentCallSid") || "";
    const callStatus = (params.get("CallStatus") || "").toLowerCase();
    const durationSec = Number(params.get("CallDuration") || "0");
    const to = params.get("To") || params.get("Called") || "";
    const from = params.get("From") || params.get("Caller") || "";

    if (!TERMINAL_STATUSES.has(callStatus)) {
      return new NextResponse(null, { status: 204 });
    }

    if (!leadId || !tenantId) {
      console.warn("[twilio/voice/status] missing lead_id or tenant_id", { callSid });
      return new NextResponse(null, { status: 204 });
    }

    const callsStatus = tenantId
      ? await getCallsIntegrationConfig(supabase, tenantId)
      : {
          config: await getGlobalCallsIntegrationConfig(supabase),
          twilioVoiceConfigured: false,
        };
    if (!isTwilioVoiceEnabled(callsStatus)) {
      console.warn("[twilio/voice/status] voice disabled — skipping call log", { callSid });
      return new NextResponse(null, { status: 204 });
    }

    if (callSid) {
      const { data: existing } = await supabase
        .from("provider_lead_communications")
        .select("id")
        .eq("channel", "call")
        .eq("external_message_id", callSid)
        .maybeSingle();
      if (existing) {
        return new NextResponse(null, { status: 204 });
      }
    }

    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id, phone_e164")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!lead) {
      return new NextResponse(null, { status: 204 });
    }

    const outcome = outcomeFromStatus(callStatus);
    const leadNumber = lead.phone_e164 || to;
    const description =
      callStatus === "completed" && durationSec > 0
        ? `Outbound call (${formatDuration(durationSec)})`
        : `Outbound call — ${callStatus.replace(/-/g, " ")}`;

    const metadata = {
      call_sid: callSid || null,
      call_status: callStatus,
      duration_seconds: durationSec,
      direction: "outbound",
      outcome,
      to,
      from,
      twilio_callback: Object.fromEntries(params.entries()),
    };

    const voiceCreds = await resolveTwilioVoiceCredentials(supabase, tenantId);
    const smsCreds = voiceCreds ? null : await resolveTwilioCredentials(supabase, tenantId);
    const fromNumber = voiceCreds?.voiceFrom || smsCreds?.smsFrom || from || null;

    const { error: commErr } = await supabase.from("provider_lead_communications").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      channel: "call",
      direction: "outbound",
      from_number: fromNumber,
      to_number: leadNumber,
      body: description,
      external_message_id: callSid || null,
      status: outcome,
      metadata,
      sent_by: adminId || null,
    });
    if (commErr) {
      // 23505: a concurrent callback already logged this CallSid — treat as deduped.
      if (commErr.code === "23505") {
        return new NextResponse(null, { status: 204 });
      }
      console.error("[twilio/voice/status] comms insert error:", commErr);
    }

    const { error: actErr } = await supabase.from("provider_lead_activities").insert({
      lead_id: leadId,
      activity_type: "call_logged",
      description,
      metadata,
      performed_by: adminId || null,
    });
    if (actErr) {
      console.error("[twilio/voice/status] activity insert error:", actErr);
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("Twilio voice status webhook error:", e);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
