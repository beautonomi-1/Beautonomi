import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { incrementBulkBatchCount } from "@/lib/whatsapp/increment-bulk-batch-count";
import { fetchAndPersistSessionApiKey } from "@/lib/whatsapp/wasender-client";
import { isOptOutKeyword } from "@/lib/provider-ops/do-not-contact";
import crypto from "crypto";

/**
 * POST /api/webhooks/wasender
 *
 * Receives webhook events from WasenderAPI:
 * - Message status updates (sent, delivered, read, failed)
 * - Inbound messages
 * - Session status changes
 *
 * Signature verification via HMAC-SHA256 if webhook_secret is configured.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();

  try {
    const rawBody = await request.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Signature verification is MANDATORY. If no enabled config row or no webhook_secret
    // is configured, reject with 503 rather than processing an unsigned payload.
    const { data: cfgRow } = await supabase
      .from("wasender_integration_config")
      .select("webhook_secret")
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const webhookSecret = (cfgRow as any)?.webhook_secret as string | undefined;

    if (!cfgRow || !webhookSecret) {
      // No enabled integration config — either Wasender is not set up for this tenant or
      // the webhook_secret has been cleared. Reject to prevent unsigned payload processing.
      return NextResponse.json(
        { error: "Wasender webhook not configured" },
        { status: 503 },
      );
    }

    const signature = request.headers.get("x-wasender-signature") || request.headers.get("x-hub-signature-256") || "";
    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    // Normalise to bare hex before comparing so `sha256=<hex>` and bare `<hex>` both work.
    const sigValue = signature.replace(/^sha256=/i, "");

    // Both buffers must be the same length before timingSafeEqual to avoid a crash.
    const sigBuf = Buffer.from(sigValue.length === expected.length * 2 || sigValue.length === expected.length ? sigValue : "", "hex");
    const expectedBuf = Buffer.from(expected, "hex");

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const eventType = payload.event || payload.type || "";
    const data = payload.data || payload;

    // ── Message status updates ──────────────────────────────────────────
    if (eventType === "messages.status" || eventType === "message.status") {
      const externalId = data.id || data.msgId || data.message_id;
      const newStatus = mapStatus(data.status);

      if (externalId && newStatus) {
        // Idempotency: only update if status is progressing forward
        const { data: existing } = await supabase
          .from("whatsapp_message_queue")
          .select("id, status, lead_id, tenant_id, bulk_batch_id")
          .eq("external_message_id", externalId)
          .maybeSingle();

        if (existing) {
          const row = existing as Record<string, any>;
          if (shouldUpdateStatus(row.status, newStatus)) {
            const updates: Record<string, any> = { status: newStatus };
            if (newStatus === "delivered") updates.delivered_at = new Date().toISOString();
            if (newStatus === "failed") {
              updates.failed_at = new Date().toISOString();
              updates.failure_reason = data.error || data.reason || "Webhook reported failure";
            }

            await supabase
              .from("whatsapp_message_queue")
              .update(updates)
              .eq("id", row.id);

            // Update communication log
            await supabase
              .from("provider_lead_communications")
              .update({ status: newStatus })
              .eq("external_message_id", externalId);

            // Update batch counters
            if (row.bulk_batch_id && newStatus === "delivered") {
              await incrementBulkBatchCount(supabase, row.bulk_batch_id, "delivered_count");
            }
          }
        }
      }
    }

    // ── Inbound messages ────────────────────────────────────────────────
    if (eventType === "messages.received" || eventType === "message.received" || eventType === "messages.upsert") {
      const fromNumber = data.from || data.sender || data.key?.remoteJid?.replace("@s.whatsapp.net", "");
      const messageText = data.message?.conversation || data.message?.extendedTextMessage?.text || data.body || data.text || "";

      if (fromNumber && messageText) {
        // Try to match to a lead by phone
        const normalizedPhone = `+${fromNumber.replace(/[^\d]/g, "")}`;
        const { data: lead } = await supabase
          .from("provider_leads")
          .select("id, tenant_id, do_not_contact")
          .eq("phone_e164", normalizedPhone)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();

        if (lead) {
          const leadRow = lead as Record<string, any>;
          await supabase.from("provider_lead_communications").insert({
            tenant_id: leadRow.tenant_id,
            lead_id: leadRow.id,
            channel: "whatsapp",
            direction: "inbound",
            from_number: normalizedPhone,
            body: messageText,
            status: "received",
            metadata: { raw_event: eventType },
          });

          await supabase.from("provider_lead_activities").insert({
            lead_id: leadRow.id,
            activity_type: "whatsapp_received",
            description: `WhatsApp reply received: "${messageText.slice(0, 80)}${messageText.length > 80 ? "..." : ""}"`,
            metadata: { from: normalizedPhone },
          });

          if (isOptOutKeyword(messageText) && !leadRow.do_not_contact) {
            const now = new Date().toISOString();
            await supabase
              .from("provider_leads")
              .update({
                do_not_contact: true,
                do_not_contact_at: now,
                do_not_contact_reason: "whatsapp_opt_out",
              })
              .eq("id", leadRow.id);

            await supabase.from("provider_lead_activities").insert({
              lead_id: leadRow.id,
              activity_type: "do_not_contact_set",
              description: "Lead opted out via WhatsApp (STOP/opt-out keyword)",
              metadata: { source: "whatsapp_webhook", keyword: messageText.trim().slice(0, 32) },
            });
          }
        }
      }
    }

    // ── Session status changes ──────────────────────────────────────────
    if (eventType === "session.status" || eventType === "status") {
      const sessionIdOrPhone = data.session_id || data.sessionId || data.id;
      const newSessionStatus = mapSessionStatus(data.status);

      if (sessionIdOrPhone && newSessionStatus) {
        await supabase
          .from("whatsapp_sessions")
          .update({
            status: newSessionStatus,
            phone_number: data.phone || data.phoneNumber || undefined,
            last_status_check_at: new Date().toISOString(),
          })
          .eq("wasender_session_id", String(sessionIdOrPhone));

        if (newSessionStatus === "connected") {
          const { data: row } = await supabase
            .from("whatsapp_sessions")
            .select("id, tenant_id, wasender_session_id")
            .eq("wasender_session_id", String(sessionIdOrPhone))
            .maybeSingle();
          const r = row as { id?: string; tenant_id?: string; wasender_session_id?: string } | null;
          if (r?.tenant_id && r?.id && r?.wasender_session_id) {
            void fetchAndPersistSessionApiKey(r.tenant_id, r.id, String(r.wasender_session_id));
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wasender-webhook: error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function mapStatus(s: string | undefined): string | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (["sent", "server_ack"].includes(lower)) return "sent";
  if (["delivered", "delivery_ack"].includes(lower)) return "delivered";
  if (["read", "read_ack"].includes(lower)) return "delivered";
  if (["failed", "error", "rejected"].includes(lower)) return "failed";
  return null;
}

function mapSessionStatus(s: string | undefined): string | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (["connected", "open", "ready"].includes(lower)) return "connected";
  if (["disconnected", "closed", "logged_out"].includes(lower)) return "disconnected";
  if (["qr", "qr_required", "scan_qr"].includes(lower)) return "qr_required";
  if (["connecting", "loading"].includes(lower)) return "connecting";
  return "error";
}

const STATUS_ORDER = ["queued", "sending", "sent", "delivered", "failed", "cancelled"];

function shouldUpdateStatus(current: string, incoming: string): boolean {
  const ci = STATUS_ORDER.indexOf(current);
  const ii = STATUS_ORDER.indexOf(incoming);
  if (ci === -1 || ii === -1) return true;
  return ii > ci;
}
