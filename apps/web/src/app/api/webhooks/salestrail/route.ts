import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/provider-ops/leads-csv-import";
import {
  listEnabledSalestrailConfigs,
  salestrailWebhookCredentials,
  type VoiceIntegrationConfigRow,
} from "@/lib/integrations/calls-config";

interface SalestrailPushPayload {
  callId?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  source?: string;
  sourceDetail?: string;
  startTime?: string;
  duration?: number;
  answered?: boolean;
  inbound?: boolean;
  number?: string;
  formattedNumber?: string;
  createdAt?: string;
}

function secureCompareStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function parseBasicAuth(request: NextRequest): { username: string; password: string } | null {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return {
      username: decoded.slice(0, colon),
      password: decoded.slice(colon + 1),
    };
  } catch {
    return null;
  }
}

function salestrailRecordingUrl(callId: string): string {
  return `https://callanalytics.salestrail.io/recordings/${callId}`;
}

/** Postgres unique_violation — a concurrent webhook already logged this call. */
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * Match the provided Basic Auth credentials against every enabled Salestrail
 * config (tenant rows first, then global). Each tenant can have its own
 * Salestrail org with distinct webhook credentials.
 */
function matchConfigByCredentials(
  configs: VoiceIntegrationConfigRow[],
  provided: { username: string; password: string },
): VoiceIntegrationConfigRow | null {
  for (const config of configs) {
    const expected = salestrailWebhookCredentials(config);
    if (!expected) continue;
    const usernameOk = secureCompareStrings(provided.username, expected.username);
    const passwordOk = secureCompareStrings(provided.password, expected.password);
    if (usernameOk && passwordOk) return config;
  }
  return null;
}

/**
 * POST /api/webhooks/salestrail
 *
 * Salestrail Push API — logs mobile/native calls to provider lead comms.
 * @see https://www.salestrail.io/knowledge-base/push-api-integration
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const configs = await listEnabledSalestrailConfigs(supabase);
    if (configs.length === 0) {
      return NextResponse.json(
        { error: "Salestrail integration is disabled" },
        { status: 503 },
      );
    }

    const provided = parseBasicAuth(request);
    const matchedConfig = provided ? matchConfigByCredentials(configs, provided) : null;
    if (!matchedConfig) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as SalestrailPushPayload;
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (!callId) {
      return NextResponse.json({ error: "callId is required" }, { status: 400 });
    }

    const rawPhone = body.formattedNumber || body.number || "";
    const phoneResult = normalizePhone(rawPhone);
    const phoneE164 = phoneResult.phone_e164;
    if (!phoneE164) {
      return NextResponse.json({ matched: false, reason: "no_phone" });
    }

    if (callId) {
      const { data: existing } = await supabase
        .from("provider_lead_communications")
        .select("id")
        .eq("channel", "call")
        .eq("external_message_id", callId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ matched: true, deduped: true });
      }
    }

    const scopedTenantId =
      matchedConfig.salestrail_default_tenant_id ?? matchedConfig.tenant_id ?? null;

    let leadQuery = supabase
      .from("provider_leads")
      .select("id, tenant_id, phone_e164, business_name")
      .eq("phone_e164", phoneE164)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (scopedTenantId) {
      leadQuery = leadQuery.eq("tenant_id", scopedTenantId);
    }

    const { data: leadRows, error: leadErr } = await leadQuery;
    if (leadErr) throw leadErr;

    const lead = (leadRows ?? [])[0] ?? null;
    if (!lead) {
      return NextResponse.json({ matched: false, reason: "lead_not_found" });
    }

    const durationSec = Number(body.duration) || 0;
    const answered = Boolean(body.answered);
    const inbound = Boolean(body.inbound);
    const direction = inbound ? "inbound" : "outbound";
    const outcome = answered ? "completed" : "missed";
    const callStatus = answered ? "completed" : "no-answer";
    const agentName = body.userName?.trim() || null;
    const agentEmail = body.userEmail?.trim() || null;
    const recordingUrl = salestrailRecordingUrl(callId);

    const description = inbound
      ? answered
        ? `Inbound call from lead (${durationSec}s)`
        : "Missed inbound call"
      : answered
        ? `Outbound call via Salestrail (${durationSec}s)`
        : "Outbound call — not answered";

    const metadata = {
      source: "salestrail",
      call_id: callId,
      duration_seconds: durationSec,
      direction,
      outcome,
      answered,
      inbound,
      agent_name: agentName,
      agent_email: agentEmail,
      agent_phone: body.userPhone ?? null,
      salestrail_user_id: body.userId ?? null,
      salestrail_source: body.source ?? null,
      salestrail_source_detail: body.sourceDetail ?? null,
      start_time: body.startTime ?? null,
      recording_url: recordingUrl,
    };

    const { error: commsErr } = await supabase.from("provider_lead_communications").insert({
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      channel: "call",
      direction,
      from_number: inbound ? phoneE164 : body.userPhone ?? null,
      to_number: inbound ? body.userPhone ?? null : phoneE164,
      body: description,
      external_message_id: callId,
      status: callStatus,
      metadata,
    });
    if (commsErr) {
      if (isUniqueViolation(commsErr)) {
        return NextResponse.json({ matched: true, deduped: true });
      }
      throw commsErr;
    }

    const { error: activityErr } = await supabase.from("provider_lead_activities").insert({
      lead_id: lead.id,
      activity_type: "call_logged",
      description,
      metadata,
    });
    if (activityErr) throw activityErr;

    return NextResponse.json({
      matched: true,
      lead_id: lead.id,
      call_id: callId,
    });
  } catch (error) {
    console.error("[webhooks/salestrail] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
