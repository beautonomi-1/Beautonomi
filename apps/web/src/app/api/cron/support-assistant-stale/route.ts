import { NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handoffStaleSupportAssistantTickets } from "@/lib/support/support-assistant/stale-backstop";

export const maxDuration = 120;

const JOB_NAME = "support-assistant-stale";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, async () => {
    const admin = getSupabaseAdmin();
    const handedOff = await handoffStaleSupportAssistantTickets(admin);
    return Response.json({ ok: true, handedOff });
  });
}
