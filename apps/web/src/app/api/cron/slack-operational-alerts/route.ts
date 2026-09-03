import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runSlackOperationalAlerts } from "@/lib/integrations/slack/operational-alerts";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const JOB_NAME = "slack-operational-alerts";

/**
 * Runs high-signal Slack operational checks. Event routing and cooldowns stay
 * centralized in the Slack integration config, so this cron can run hourly.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    try {
      const summary = await runSlackOperationalAlerts();
      return NextResponse.json({ ok: true, summary });
    } catch (error) {
      console.error("[slack-operational-alerts]", error);
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Slack operational alerts failed" },
        { status: 500 }
      );
    }
  });
}
