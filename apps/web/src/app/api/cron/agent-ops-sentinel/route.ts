import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runOpsSentinelWorkflow } from "@/lib/agents/workflows/ops-sentinel";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slackNotifyAgentRunFailed } from "@/lib/integrations/slack/agent-triggers";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const pageSize = 50;
  let offset = 0;
  const results = [];

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
        results.push(await runOpsSentinelWorkflow({ tenantId: t.id, environment: "production" }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        Sentry.captureException(error, {
          tags: { workflow: "ops-sentinel", cron: "agent-ops-sentinel" },
          extra: { tenantId: t.id },
        });
        slackNotifyAgentRunFailed({
          tenantId: t.id,
          runId: `ops-sentinel-${t.id}`,
          workflowType: "ops-sentinel",
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
