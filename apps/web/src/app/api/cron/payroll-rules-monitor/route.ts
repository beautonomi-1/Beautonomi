import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "payroll-rules-monitor";

export const maxDuration = 120;

/**
 * GET /api/cron/payroll-rules-monitor
 * Alerts when published payroll rules do not cover today + 60 days for active jurisdictions.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request).valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, runJob);
}

async function runJob(): Promise<Response> {
  const admin = getSupabaseAdmin();
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 60);
  const todayStr = today.toISOString().slice(0, 10);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const { data: jurisdictions } = await admin
    .from("payroll_jurisdictions")
    .select("code, name, support_level")
    .eq("status", "active")
    .neq("support_level", "manual");

  const gaps: Array<{ code: string; rule_type: string }> = [];
  for (const j of jurisdictions ?? []) {
    for (const ruleType of ["income_tax", "social_contributions", "public_holidays"] as const) {
      const { data: rules } = await admin
        .from("payroll_rule_sets")
        .select("id")
        .eq("jurisdiction_code", (j as { code: string }).code)
        .eq("rule_type", ruleType)
        .eq("status", "published")
        .lte("effective_from", horizonStr)
        .or(`effective_to.is.null,effective_to.gte.${todayStr}`)
        .limit(1);
      if (!rules?.length) {
        gaps.push({ code: (j as { code: string }).code, rule_type: ruleType });
      }
    }
  }

  if (gaps.length > 0) {
    console.warn("[payroll-rules-monitor] coverage gaps:", gaps);
  }

  return Response.json({ ok: true, gaps, checked_at: new Date().toISOString() });
}
