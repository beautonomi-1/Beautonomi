/**
 * GET /api/cron/process-notification-queue
 *
 * §15.4-25 (audit 2026-04) — Durable retry queue for notifications.
 *
 * Scans `notification_delivery_queue` for rows where:
 *   - status IN ('pending', 'failed')
 *   - next_attempt_at <= now()
 * and attempts delivery via the appropriate channel handler (email, push,
 * sms, in_app). On success → `delivered`. On failure → `failed` with
 * exponential backoff, or `dead_letter` once `attempts >= max_attempts`.
 *
 * The producers of queue rows are notification-service helpers that
 * insert durable rows in addition to (or instead of) firing one-shot
 * OneSignal / Resend calls — the queue guarantees eventual delivery
 * even if the worker that triggered the notification crashed mid-send.
 *
 * Meant to run every 2 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 50;
const LEASE_SECONDS = 120; // worker has 2m to complete; falls back to `failed` on crash

// Wave 3.3 (audit 2026-04 final 100/100): circuit breaker + DLQ alerting.
// - CIRCUIT_BREAKER_CONSECUTIVE_FAIL: if this many rows fail back-to-back
//   within a single run we bail out, because continuing to hammer a
//   downstream provider (OneSignal / Resend / SMS) during an outage just
//   burns attempts and pushes good rows into the DLQ prematurely.
// - DLQ_ALERT_THRESHOLD: end-of-run query. If global DLQ depth exceeds
//   this we emit a Sentry warning tagged `notif.queue.dlq_alert=true`
//   for pager-worthy on-call visibility.
const CIRCUIT_BREAKER_CONSECUTIVE_FAIL = 10;
const DLQ_ALERT_THRESHOLD = 10;

import type { QueuedNotificationRow } from "@/lib/notifications/queued-senders";

type QueueRow = QueuedNotificationRow;

function backoffSeconds(attempts: number): number {
  // 30s, 1m, 5m, 30m, 2h, 6h ...
  const table = [30, 60, 300, 1800, 7200, 21600];
  return table[Math.min(attempts, table.length - 1)];
}

type DeliveryResult = { ok: true } | { ok: false; error: string };

async function deliverRow(row: QueueRow): Promise<DeliveryResult> {
  try {
    if (row.channel === "in_app") {
      const { insertNotification } = await import(
        "@/lib/notifications/insert-notification"
      );
      if (!row.recipient_user_id) {
        return { ok: false, error: "recipient_user_id missing for in_app" };
      }
      await insertNotification({
        user_id: row.recipient_user_id,
        type: row.template_key,
        title: String(row.payload?.title ?? "Notification"),
        message: String(row.payload?.message ?? ""),
        data: (row.payload?.data as Record<string, unknown>) ?? {},
      });
      return { ok: true };
    }

    if (row.channel === "push") {
      const { sendToUser } = await import("@/lib/notifications/onesignal").catch(
        () => ({
          sendToUser: null as unknown as (
            userId: string,
            payload: { title: string; message: string; url?: string; data?: Record<string, unknown> },
          ) => Promise<unknown>,
        }),
      );
      if (!sendToUser || !row.recipient_user_id) {
        return { ok: false, error: "push sender unavailable or missing recipient" };
      }
      await sendToUser(row.recipient_user_id, {
        title: String(row.payload?.title ?? "Beautonomi"),
        message: String(row.payload?.message ?? ""),
        url: row.payload?.url ? String(row.payload.url) : undefined,
        data: (row.payload?.data as Record<string, unknown>) ?? {},
      });
      return { ok: true };
    }

    if (row.channel === "email") {
      // Delegate to the shared email sender. Template/payload resolution
      // lives inside the sender so this queue stays channel-agnostic.
      const { sendQueuedEmail } = await import(
        "@/lib/notifications/queued-senders"
      );
      await sendQueuedEmail(row);
      return { ok: true };
    }

    if (row.channel === "sms") {
      const { sendQueuedSms } = await import(
        "@/lib/notifications/queued-senders"
      );
      await sendQueuedSms(row);
      return { ok: true };
    }

    return { ok: false, error: `unknown channel: ${row.channel}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();

  // 1. Reclaim stuck `in_flight` rows whose lease is older than LEASE_SECONDS.
  const reclaimCutoff = new Date(now.getTime() - LEASE_SECONDS * 1000).toISOString();
  await supabase
    .from("notification_delivery_queue")
    .update({ status: "failed", last_error: "lease expired; worker crashed" })
    .eq("status", "in_flight")
    .lt("last_attempt_at", reclaimCutoff);

  // 2. Fetch due rows.
  const { data: due, error: dueErr } = await supabase
    .from("notification_delivery_queue")
    .select(
      "id, channel, template_key, payload, attempts, max_attempts, recipient_user_id, booking_id, notification_id",
    )
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (dueErr) {
    console.error("[notif-queue] fetch due failed", dueErr);
    return NextResponse.json({ ok: false, error: dueErr.message }, { status: 500 });
  }

  const rows = (due ?? []) as QueueRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, delivered: 0 });
  }

  let delivered = 0;
  let failed = 0;
  let deadLettered = 0;
  let consecutiveFailures = 0;
  let circuitOpen = false;

  for (const row of rows) {
    if (circuitOpen) break;

    // Claim the row (optimistic: status must still be pending/failed).
    const { data: claimed } = await supabase
      .from("notification_delivery_queue")
      .update({
        status: "in_flight",
        attempts: row.attempts + 1,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();

    if (!claimed) continue; // someone else grabbed it

    const result = await deliverRow(row);

    if (result.ok === true) {
      await supabase
        .from("notification_delivery_queue")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      delivered += 1;
      consecutiveFailures = 0;
    } else {
      const nextAttempts = row.attempts + 1;
      const isDead = nextAttempts >= row.max_attempts;
      if (isDead) {
        await supabase
          .from("notification_delivery_queue")
          .update({
            status: "dead_letter",
            dead_lettered_at: new Date().toISOString(),
            last_error: result.error.slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        deadLettered += 1;
      } else {
        const nextAt = new Date(
          Date.now() + backoffSeconds(nextAttempts) * 1000,
        ).toISOString();
        await supabase
          .from("notification_delivery_queue")
          .update({
            status: "failed",
            last_error: result.error.slice(0, 2000),
            next_attempt_at: nextAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failed += 1;
      }

      consecutiveFailures += 1;
      if (consecutiveFailures >= CIRCUIT_BREAKER_CONSECUTIVE_FAIL) {
        // Downstream provider looks wedged. Stop burning attempts; the
        // next cron tick in ~2m will try again with fresh capacity.
        circuitOpen = true;
        try {
          Sentry.captureMessage(
            `[notif-queue] circuit breaker tripped after ${consecutiveFailures} consecutive delivery failures`,
            {
              level: "error",
              tags: {
                "notif.queue.circuit_breaker": "true",
                "notif.queue.last_error_channel": row.channel,
              },
              extra: {
                last_error: result.error?.slice(0, 500),
                delivered,
                failed,
                dead_lettered: deadLettered,
                batch_size: rows.length,
              },
            },
          );
        } catch {
          // ignore sentry failures
        }
      }
    }
  }

  // DLQ depth alert (fires independent of this run's outcome).
  let dlqDepth: number | null = null;
  try {
    const { count } = await supabase
      .from("notification_delivery_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead_letter");
    dlqDepth = count ?? 0;
    if (dlqDepth > DLQ_ALERT_THRESHOLD) {
      Sentry.captureMessage(
        `[notif-queue] DLQ depth ${dlqDepth} exceeds threshold ${DLQ_ALERT_THRESHOLD}`,
        {
          level: "warning",
          tags: { "notif.queue.dlq_alert": "true" },
          extra: {
            dlq_depth: dlqDepth,
            threshold: DLQ_ALERT_THRESHOLD,
            last_run_delivered: delivered,
            last_run_failed: failed,
            last_run_dead_lettered: deadLettered,
          },
        },
      );
    }
  } catch {
    // ignore DLQ count failures; not operationally blocking
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    delivered,
    failed,
    dead_lettered: deadLettered,
    circuit_breaker_tripped: circuitOpen,
    dlq_depth: dlqDepth,
  });
}
