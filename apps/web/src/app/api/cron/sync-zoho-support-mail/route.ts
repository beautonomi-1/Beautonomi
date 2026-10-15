import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { syncZohoSupportInbox } from "@/lib/support/zoho-mail-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "sync-zoho-support-mail";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, async () => {
    const supabase = getSupabaseAdmin();
    const result = await syncZohoSupportInbox(supabase);
    return NextResponse.json({ ok: true, ...result });
  });
}
