/**
 * GET /api/cron/gift-card-expiry-reminders
 *
 * Daily (08:20 UTC):
 *   (a) deliver due scheduled gift card orders (deliver_at <= now, delivered_at null)
 *       via email and/or SMS, plus the SMS leg of immediate orders;
 *   (b) send 30-day and 7-day expiry reminders for active cards with a balance
 *       (idempotent via gift_cards.reminder_30_sent_at / reminder_7_sent_at).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/with-cron-lock";
import {
  deliverDueScheduledGiftCards,
  sendGiftCardExpiryReminders,
} from "@/lib/gift-cards/gift-card-delivery";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const outcome = await withCronLock(supabase, "gift-card-expiry-reminders", async () => {
    const now = new Date();
    const delivery = await deliverDueScheduledGiftCards(supabase, now);
    const reminders = await sendGiftCardExpiryReminders(supabase, now);
    return {
      ok: true,
      delivery,
      reminders,
    };
  });

  if (outcome.status === "skipped") {
    return NextResponse.json({ ok: true, skipped: true, reason: outcome.reason });
  }
  if (outcome.status === "failed") {
    return NextResponse.json({ error: outcome.error }, { status: 500 });
  }

  return NextResponse.json(outcome.result);
}
