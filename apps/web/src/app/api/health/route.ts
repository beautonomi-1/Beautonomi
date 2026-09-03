import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  paystackKeyProbe,
  runHealthProbes,
  supabaseProbe,
  upstashProbe,
} from "@/lib/health/deep-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/health
 *
 * Deep health: Supabase (admin client round-trip), Upstash (REST ping, if configured),
 * Paystack (key presence/shape). Each check is bounded to 2s. Returns 200 when every
 * critical check passes, 503 otherwise, always with per-check detail so the
 * post-deploy smoke step and uptime monitors can tell WHICH dependency is down.
 */
export async function GET() {
  const report = await runHealthProbes(
    [supabaseProbe(() => getSupabaseAdmin() as never), upstashProbe(), paystackKeyProbe()],
    { release: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
  );
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
