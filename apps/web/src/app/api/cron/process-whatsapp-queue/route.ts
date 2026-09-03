import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveSessionMessagingBearer, sendTextMessage } from "@/lib/whatsapp/wasender-client";
import { incrementBulkBatchCount } from "@/lib/whatsapp/increment-bulk-batch-count";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "process-whatsapp-queue";
export const maxDuration = 300;

const MAX_PER_INVOCATION = 10;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /api/cron/process-whatsapp-queue
 *
 * Processes up to 10 queued WhatsApp messages per invocation.
 * Enforces session-level daily/hourly limits, pacing, and auto-pause on consecutive failures.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  // Runs every 2 minutes; reclaim a dead run quickly so the queue never stalls.
  return runLockedCronRoute(JOB_NAME, () => runJob(request), { staleAfterMinutes: 6 });
}

async function runJob(request: NextRequest) {
  const { valid, error } = verifyCronRequest(request);
  if (!valid) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let rateLimited = 0;

  try {
    // Pick up queued or retryable messages
    const { data: messages, error: fetchErr } = await supabase
      .from("whatsapp_message_queue")
      .select("*")
      .in("status", ["queued", "rate_limited"])
      .lte("scheduled_at", now)
      .order("priority", { ascending: false })
      .order("scheduled_at", { ascending: true })
      .limit(MAX_PER_INVOCATION);

    if (fetchErr) throw fetchErr;
    if (!messages || messages.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    // Group by session for limit checking
    const sessionIds = [...new Set((messages as any[]).map((m) => m.session_id))];
    const { data: sessions } = await supabase
      .from("whatsapp_sessions")
      .select(
        "id, tenant_id, wasender_session_id, wasender_session_api_key, status, is_paused, daily_send_count, hourly_send_count, phone_number",
      )
      .in("id", sessionIds);

    const sessionMap = new Map((sessions as any[] || []).map((s: any) => [s.id, s]));

    // Preload DNC status for leads in this batch
    const leadIds = [...new Set((messages as any[]).map((m) => m.lead_id).filter(Boolean))];
    const dncLeadIds = new Set<string>();
    if (leadIds.length > 0) {
      const { data: dncLeads } = await supabase
        .from("provider_leads")
        .select("id")
        .in("id", leadIds)
        .or("do_not_contact.eq.true,deleted_at.not.is.null");
      for (const row of dncLeads as { id: string }[] || []) {
        dncLeadIds.add(row.id);
      }
    }

    // Load config
    const { data: cfgRow } = await supabase
      .from("wasender_integration_config")
      .select("*")
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cfg = cfgRow as Record<string, any> | null;
    const pacingMs = Math.max(cfg?.bulk_pacing_ms ?? 5000, 3000);
    const dailyLimit = cfg?.daily_send_limit_per_session ?? 200;
    const hourlyLimit = cfg?.hourly_send_limit_per_session ?? 30;
    const failureThreshold = cfg?.auto_pause_on_failure_count ?? 3;
    const baseUrl = (cfg?.base_url || "https://www.wasenderapi.com").replace(/\/+$/, "");

    const consecutiveFailures = new Map<string, number>();

    for (const msg of messages as any[]) {
      const session = sessionMap.get(msg.session_id);

      // Do-not-contact gate
      if (msg.lead_id && dncLeadIds.has(msg.lead_id)) {
        await supabase
          .from("whatsapp_message_queue")
          .update({
            status: "cancelled",
            failure_reason: "do_not_contact",
          })
          .eq("id", msg.id);
        if (msg.bulk_batch_id) {
          await incrementBulkBatchCount(supabase, msg.bulk_batch_id, "cancelled_count");
        }
        processed++;
        continue;
      }

      // Session health gate
      if (!session || session.status !== "connected" || session.is_paused) {
        await supabase
          .from("whatsapp_message_queue")
          .update({ status: "rate_limited" })
          .eq("id", msg.id);
        rateLimited++;
        continue;
      }

      // Daily/hourly limit gate
      if ((session.daily_send_count || 0) >= dailyLimit || (session.hourly_send_count || 0) >= hourlyLimit) {
        await supabase
          .from("whatsapp_message_queue")
          .update({ status: "rate_limited" })
          .eq("id", msg.id);
        rateLimited++;
        continue;
      }

      // Claim the message
      await supabase
        .from("whatsapp_message_queue")
        .update({ status: "sending" })
        .eq("id", msg.id)
        .eq("status", msg.status);

      try {
        const bearer = await resolveSessionMessagingBearer(String(session.tenant_id), {
          id: session.id,
          wasender_session_id: String(session.wasender_session_id),
          wasender_session_api_key: session.wasender_session_api_key,
        });
        if (!bearer) {
          throw new Error("Session API key missing — sync from Wasender (open WhatsApp Sessions in admin)");
        }

        const result = await sendTextMessage(baseUrl, bearer, msg.to_number, msg.message_body);

        if (result.success) {
          const externalId =
            result.data?.msgId != null ? String(result.data.msgId) : result.data?.id != null ? String(result.data.id) : null;

          await supabase
            .from("whatsapp_message_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              external_message_id: externalId,
            })
            .eq("id", msg.id);

          // Log to communications
          await supabase.from("provider_lead_communications").insert({
            tenant_id: msg.tenant_id,
            lead_id: msg.lead_id,
            channel: "whatsapp",
            direction: "outbound",
            from_number: session.phone_number ?? null,
            to_number: msg.to_number,
            body: msg.message_body,
            template_id: msg.template_id,
            external_message_id: externalId,
            status: "sent",
            sent_by: msg.created_by,
            metadata: { session_id: msg.session_id, bulk_batch_id: msg.bulk_batch_id },
          });

          if (msg.lead_id) {
            await supabase.from("provider_lead_activities").insert({
              lead_id: msg.lead_id,
              activity_type: "whatsapp_sent",
              description: `WhatsApp sent: "${msg.message_body.slice(0, 60)}..."`,
              metadata: { session_id: msg.session_id, bulk_batch_id: msg.bulk_batch_id },
              performed_by: msg.created_by,
            });
          }

          // Update session counters
          session.daily_send_count = (session.daily_send_count || 0) + 1;
          session.hourly_send_count = (session.hourly_send_count || 0) + 1;
          await supabase
            .from("whatsapp_sessions")
            .update({
              daily_send_count: session.daily_send_count,
              hourly_send_count: session.hourly_send_count,
            })
            .eq("id", session.id);

          // Update batch counters
          if (msg.bulk_batch_id) {
            await incrementBulkBatchCount(supabase, msg.bulk_batch_id, "sent_count");
          }

          consecutiveFailures.set(msg.session_id, 0);
          sent++;
        } else {
          throw new Error(result.message || "Send failed");
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const retryCount = (msg.retry_count || 0) + 1;
        const maxRetries = msg.max_retries ?? 2;

        if (retryCount <= maxRetries) {
          const backoffMs = Math.min(45 * 60 * 1000, 5 * 60 * 1000 * Math.pow(3, retryCount - 1));
          await supabase
            .from("whatsapp_message_queue")
            .update({
              status: "queued",
              retry_count: retryCount,
              next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
              scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
              failure_reason: reason,
            })
            .eq("id", msg.id);
        } else {
          await supabase
            .from("whatsapp_message_queue")
            .update({
              status: "failed",
              failed_at: new Date().toISOString(),
              failure_reason: reason,
              retry_count: retryCount,
            })
            .eq("id", msg.id);

          if (msg.bulk_batch_id) {
            await incrementBulkBatchCount(supabase, msg.bulk_batch_id, "failed_count");
          }
        }

        const cf = (consecutiveFailures.get(msg.session_id) || 0) + 1;
        consecutiveFailures.set(msg.session_id, cf);

        if (cf >= failureThreshold) {
          await supabase
            .from("whatsapp_sessions")
            .update({
              is_paused: true,
              pause_reason: "auto: consecutive failures",
              paused_at: new Date().toISOString(),
            })
            .eq("id", msg.session_id);

          // Pause any active batches for this session
          await supabase
            .from("whatsapp_bulk_batches")
            .update({ status: "paused", pause_reason: "auto: session paused due to failures" })
            .eq("session_id", msg.session_id)
            .in("status", ["queued", "processing"]);

          session.is_paused = true;
        }

        failed++;
      }

      processed++;

      // Pacing between sends
      if (processed < (messages as any[]).length) {
        await sleep(pacingMs);
      }
    }

    await writeAuditLog({
      action: "system.whatsapp.queue.processed",
      entity_type: "whatsapp_message_queue",
      module: "whatsapp",
      risk_level: "low",
      retention_tier: "routine",
      status: "succeeded",
      metadata: { processed, sent, failed, rate_limited: rateLimited },
    });

    return NextResponse.json({ ok: true, processed, sent, failed, rate_limited: rateLimited });
  } catch (err) {
    console.error("process-whatsapp-queue: error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Queue processing failed" },
      { status: 500 },
    );
  }
}
