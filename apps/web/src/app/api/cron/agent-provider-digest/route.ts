import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runProviderDigestSweepForTenant } from "@/lib/agents/workflows/provider-ops";
import { slackNotifyAgentRunFailed } from "@/lib/integrations/slack/agent-triggers";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

export const maxDuration = 300;

const JOB_NAME = "agent-provider-digest";

/**
 * Weekly provider digest proposals (Monday morning). Each active provider
 * with bookings last week gets a "your week at a glance" digest proposed;
 * an admin approves and the executor delivers it via push + email.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const environment = process.env.VERCEL_ENV === "production" ? "production" : "staging";
  const supabase = getSupabaseAdmin();
  const pageSize = 50;
  let offset = 0;
  const results: Array<Record<string, unknown>> = [];

  for (;;) {
    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("is_active", true)
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!tenants?.length) break;

    for (const t of tenants) {
      try {
        const digest = await runProviderDigestSweepForTenant({ tenantId: t.id, environment });
        results.push({ tenantId: t.id, ...digest });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        Sentry.captureException(error, {
          tags: { workflow: "provider-digest", cron: "agent-provider-digest" },
          extra: { tenantId: t.id },
        });
        slackNotifyAgentRunFailed({
          tenantId: t.id,
          runId: `provider-digest-${t.id}`,
          workflowType: "provider-digest",
          error: message,
        });
        results.push({ tenantId: t.id, error: message });
      }
    }

    if (tenants.length < pageSize) break;
    offset += pageSize;
  }

  return Response.json({ ok: true, tenantCount: results.length, results });
}
