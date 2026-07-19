/**
 * GET /api/cron/identity-verification-reconcile
 *
 * Reconciliation cron job: re-fetches Didit decision for any non-terminal
 * verification session whose last_checked_at is stale (>15 minutes).
 *
 * This covers the ~3-delivery window after Didit's 2 retries — if all
 * webhook deliveries fail, reconciliation converges state to Didit's.
 *
 * Should be scheduled every 15 minutes via Vercel Cron or equivalent.
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reconcileSession } from "@/lib/identity-verification/identity-verification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MINUTES = 15;
const MAX_BATCH = 50;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  // Find non-terminal sessions not checked in the last STALE_MINUTES
  const { data: staleSessions, error } = await supabase
    .from("identity_verification_sessions")
    .select("id, provider_session_id")
    .not("status", "in", '("approved","rejected","expired","abandoned","errored")')
    .not("provider_session_id", "is", null)
    .or(`last_checked_at.is.null,last_checked_at.lt.${staleThreshold}`)
    .limit(MAX_BATCH);

  if (error) {
    console.error("[reconcile] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (staleSessions ?? []) as { id: string; provider_session_id: string }[];
  let reconciled = 0;
  let failed = 0;

  for (const session of sessions) {
    try {
      await reconcileSession(session.id, session.provider_session_id);
      reconciled++;
    } catch (err) {
      failed++;
      console.warn(`[reconcile] session ${session.id} failed:`, err);
    }
  }

  console.log(`[reconcile] reconciled=${reconciled} failed=${failed} total=${sessions.length}`);
  return NextResponse.json({ reconciled, failed, total: sessions.length });
}
