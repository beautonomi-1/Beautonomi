import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processQueuedAuditPacks } from "@/lib/grc/audit-pack/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every 10 minutes: build any queued audit packs so requesters aren't waiting for the daily tick. */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });

  return runLockedCronRoute("grc-audit-packs", async () => {
    const admin = getSupabaseAdmin();
    const { count } = await admin.from("grc_audit_packs").select("id", { count: "exact", head: true }).in("status", ["queued", "building"]);
    if (!count) return NextResponse.json({ ok: true, built: [], failed: [] });
    const result = await processQueuedAuditPacks(admin);
    return NextResponse.json({ ok: result.failed.length === 0, ...result });
  });
}
