import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/cron/reset-whatsapp-counters
 *
 * Runs every hour to reset hourly_send_count.
 * Resets daily_send_count when the last reset was >24h ago.
 */
export async function GET(request: NextRequest) {
  const { valid, error } = verifyCronRequest(request);
  if (!valid) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();

  // Always reset hourly counts
  const { error: hourlyErr } = await supabase
    .from("whatsapp_sessions")
    .update({ hourly_send_count: 0 })
    .gt("hourly_send_count", 0);

  if (hourlyErr) {
    console.error("reset-whatsapp-counters: hourly reset error", hourlyErr);
  }

  // Reset daily counts at midnight (check if last reset was >22 hours ago for safety)
  const cutoff = new Date(now.getTime() - 22 * 60 * 60 * 1000).toISOString();
  const { error: dailyErr } = await supabase
    .from("whatsapp_sessions")
    .update({ daily_send_count: 0, last_send_count_reset_at: now.toISOString() })
    .or(`last_send_count_reset_at.lt.${cutoff},last_send_count_reset_at.is.null`)
    .gt("daily_send_count", 0);

  if (dailyErr) {
    console.error("reset-whatsapp-counters: daily reset error", dailyErr);
  }

  return NextResponse.json({ ok: true, timestamp: now.toISOString() });
}
