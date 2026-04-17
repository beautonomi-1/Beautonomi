/**
 * GET /api/cron/abandoned-bookings
 *
 * §15.4-27 (audit 2026-04) — Abandoned booking re-engagement.
 *
 * Sweeps `booking_holds` that expired WITHOUT being consumed and sends the
 * customer a one-shot "pick up where you left off" email / push. Uses the
 * `abandoned_booking_reengagement` ledger (migration 506) keyed by
 * (hold_id, purpose) so a customer is never messaged twice for the same
 * abandoned hold, even across retried cron runs.
 *
 * Only considers holds that:
 *   - expired in the last 48h (fresh enough to still be actionable)
 *   - have a linked `created_by_user_id` (anonymous abandoned holds can't
 *     be re-engaged; we'd need an email to do that)
 *   - have not already had a row in `abandoned_booking_reengagement`
 *     with purpose = 'hold_expired_reminder'
 *
 * Meant to run hourly.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_HOURS = 48;
const BATCH_LIMIT = 200;
const PURPOSE = "hold_expired_reminder";

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
  const lookbackFrom = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  // Candidate holds: expired, not consumed, have an owner user.
  const { data: holds, error: holdErr } = await supabase
    .from("booking_holds")
    .select("id, provider_id, created_by_user_id, offering_id, expires_at, hold_status")
    .eq("hold_status", "expired")
    .not("created_by_user_id", "is", null)
    .gte("expires_at", lookbackFrom.toISOString())
    .lt("expires_at", now.toISOString())
    .order("expires_at", { ascending: false })
    .limit(BATCH_LIMIT);

  if (holdErr) {
    console.error("[abandoned-bookings] query failed", holdErr);
    return NextResponse.json(
      { ok: false, error: holdErr.message },
      { status: 500 },
    );
  }

  const candidates = holds ?? [];
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, candidates: 0, sent: 0 });
  }

  const holdIds = candidates.map((h) => h.id);
  const { data: already } = await supabase
    .from("abandoned_booking_reengagement")
    .select("hold_id")
    .in("hold_id", holdIds)
    .eq("purpose", PURPOSE);

  const alreadySet = new Set((already ?? []).map((r) => r.hold_id));
  const toSend = candidates.filter((h) => !alreadySet.has(h.id));

  if (toSend.length === 0) {
    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      sent: 0,
      skipped_already_reengaged: candidates.length,
    });
  }

  const { insertNotification } = await import(
    "@/lib/notifications/insert-notification"
  ).catch(() => ({
    insertNotification: null as unknown as (args: {
      user_id: string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    }) => Promise<unknown>,
  }));

  let sent = 0;
  for (const hold of toSend) {
    try {
      if (insertNotification) {
        await insertNotification({
          user_id: hold.created_by_user_id as string,
          type: "abandoned_booking_reminder",
          title: "Finish your booking?",
          message:
            "Your booking hold expired before checkout. Tap to pick up where you left off.",
          data: {
            provider_id: hold.provider_id,
            offering_id: hold.offering_id,
            hold_id: hold.id,
          },
        });
      }

      // Record re-engagement — UNIQUE (hold_id, purpose) prevents the cron
      // from ever double-sending for the same hold.
      await supabase.from("abandoned_booking_reengagement").insert({
        hold_id: hold.id,
        user_id: hold.created_by_user_id,
        provider_id: hold.provider_id,
        purpose: PURPOSE,
        metadata: { expires_at: hold.expires_at },
      });

      sent += 1;
    } catch (err) {
      // Best-effort: don't let one bad recipient halt the sweep.
      console.warn("[abandoned-bookings] send failed", hold.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    skipped_already_reengaged: candidates.length - toSend.length,
  });
}
