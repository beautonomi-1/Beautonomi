import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  runSupportTriageBackstop,
  runWorkforceSweepForTenant,
} from "@/lib/agents/workflows/workforce-sweep";
import { runSupportFollowUpSweep } from "@/lib/agents/workflows/support-followups";
import { runRefundBriefingSweepForTenant } from "@/lib/agents/workflows/refund-preprocessor";
import { expireStaleProposals } from "@/lib/agents/actions/action-service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slackNotifyAgentRunFailed } from "@/lib/integrations/slack/agent-triggers";

export const maxDuration = 300;

/**
 * Agent workforce sweep — generates human-reviewable proposals for pending
 * payouts, open reconciliation exceptions, fraud cases, disputes, user
 * reports, and untriaged support tickets. Proposal-only: humans approve and
 * execute everything from the Agentic Console.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const environment = process.env.VERCEL_ENV === "production" ? "production" : "staging";
  const supabase = getSupabaseAdmin();
  const pageSize = 50;
  let offset = 0;
  const results: Array<Record<string, unknown>> = [];

  // Retire overdue proposals first so re-sweeps can propose with fresh data.
  let expiredProposals = 0;
  try {
    expiredProposals = await expireStaleProposals();
  } catch (error) {
    Sentry.captureException(error, { tags: { workflow: "expire-proposals", cron: "agent-workforce-sweep" } });
  }

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
        const sweep = await runWorkforceSweepForTenant({ tenantId: t.id, environment });
        const refunds = await runRefundBriefingSweepForTenant({ tenantId: t.id, environment }).catch(
          (err) => ({ skipped: true as const, reason: String(err).slice(0, 120) }),
        );
        results.push({ tenantId: t.id, ...sweep, refunds });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        Sentry.captureException(error, {
          tags: { workflow: "workforce-sweep", cron: "agent-workforce-sweep" },
          extra: { tenantId: t.id },
        });
        slackNotifyAgentRunFailed({
          tenantId: t.id,
          runId: `workforce-sweep-${t.id}`,
          workflowType: "workforce-sweep",
          error: message,
        });
        results.push({ tenantId: t.id, error: message });
      }
    }

    if (tenants.length < pageSize) break;
    offset += pageSize;
  }

  let triageBackstop: Record<string, unknown> = {};
  try {
    triageBackstop = await runSupportTriageBackstop(environment);
  } catch (error) {
    Sentry.captureException(error, { tags: { workflow: "support-triage", cron: "agent-workforce-sweep" } });
    triageBackstop = { error: error instanceof Error ? error.message : "unknown_error" };
  }

  // Platform-wide support follow-ups (nudges, SLA escalations, CSAT recovery).
  let followUps: Record<string, unknown> = {};
  try {
    followUps = await runSupportFollowUpSweep(environment);
  } catch (error) {
    Sentry.captureException(error, { tags: { workflow: "support-followups", cron: "agent-workforce-sweep" } });
    followUps = { error: error instanceof Error ? error.message : "unknown_error" };
  }

  return Response.json({
    ok: true,
    tenantCount: results.length,
    expiredProposals,
    results,
    triageBackstop,
    followUps,
  });
}
