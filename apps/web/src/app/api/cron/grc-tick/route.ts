import { NextRequest, NextResponse } from "next/server";
import { GRC_HUB_FEATURE_FLAG } from "@beautonomi/admin-access";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runDueCollectors } from "@/lib/grc/collectors";
import { runGrcScheduler } from "@/lib/grc/scheduler";
import { processQueuedAuditPacks } from "@/lib/grc/audit-pack/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "grc-tick";

/**
 * Daily 06:30 UTC. Runs automated evidence collectors (weekly ones on Mondays), then housekeeping
 * (expiries, evidence requests, reminders). `?collectors=a,b` forces specific collectors (manual re-run).
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });

  return runLockedCronRoute(JOB_NAME, async () => {
    const admin = getSupabaseAdmin();
    const { data: flag } = await admin.from("feature_flags").select("enabled").eq("feature_key", GRC_HUB_FEATURE_FLAG).is("tenant_id", null).maybeSingle();
    if (!(flag as { enabled?: boolean } | null)?.enabled) return NextResponse.json({ ok: true, skipped: "grc_hub_enabled is off" });

    const only = new URL(request.url).searchParams.get("collectors")?.split(",").map((s) => s.trim()).filter(Boolean);
    const collectors = await runDueCollectors(admin, new Date(), only?.length ? only : undefined);
    const scheduler = await runGrcScheduler(admin);
    const packs = await processQueuedAuditPacks(admin);

    const errors = collectors.filter((c) => c.status === "error");
    return NextResponse.json({ ok: errors.length === 0, collectors, scheduler, audit_packs: packs }, { status: errors.length ? 207 : 200 });
  });
}
