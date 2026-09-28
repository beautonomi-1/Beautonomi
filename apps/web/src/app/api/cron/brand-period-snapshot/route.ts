import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { resolveUtcPeriod } from "@/lib/brand-marketing/periods";
import { sumKnownSpendForTenant } from "@/lib/brand-marketing/metrics";
import { writeKpiSnapshotsForTenant } from "@/lib/brand-marketing/scorecard";
import { runStrategyPacingAlertsForTenant } from "@/lib/brand-marketing/strategy-pacing-alerts";

const JOB_NAME = "brand-period-snapshot";
export const maxDuration = 300;

function isPeriodEnd(d: Date, kind: "week" | "month" | "quarter"): boolean {
  const day = d.getUTCDay();
  const date = d.getUTCDate();
  const month = d.getUTCMonth();
  if (kind === "week") return day === 0;
  if (kind === "month") {
    const last = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return date === last;
  }
  if (kind === "quarter") {
    const qEndMonths = [2, 5, 8, 11];
    if (!qEndMonths.includes(month)) return false;
    const last = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return date === last;
  }
  return false;
}

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob());
}

async function runJob() {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const kinds: Array<"week" | "month" | "quarter"> = [];
  if (isPeriodEnd(yesterday, "week")) kinds.push("week");
  if (isPeriodEnd(yesterday, "month")) kinds.push("month");
  if (isPeriodEnd(yesterday, "quarter")) kinds.push("quarter");
  if (kinds.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not a period end" });
  }

  const supabase = getSupabaseAdmin();
  const { data: tenants } = await supabase.from("tenants").select("id").eq("is_active", true);
  let written = 0;

  for (const kind of kinds) {
    const preset = kind === "week" ? "this_week" : kind === "month" ? "this_month" : "this_quarter";
    const period = resolveUtcPeriod(preset as "this_week", undefined, undefined, yesterday);
    for (const t of tenants ?? []) {
      const spend = await sumKnownSpendForTenant(supabase, t.id, period);
      const { error } = await supabase.from("brand_period_snapshots").upsert(
        {
          tenant_id: t.id,
          period_kind: kind,
          period_start: period.start.toISOString().slice(0, 10),
          period_end: period.end.toISOString().slice(0, 10),
          payload: { spend, captured_at: new Date().toISOString() },
        },
        { onConflict: "tenant_id,period_kind,period_start,period_end" },
      );
      if (!error) written += 1;
      if (kind === "week") {
        await writeKpiSnapshotsForTenant(supabase, t.id, period);
        await runStrategyPacingAlertsForTenant(supabase, t.id, period);
      }
    }
  }

  return NextResponse.json({ ok: true, written, kinds });
}
