/**
 * GET /api/cron/recognize-period-revenue
 * Daily deferred-revenue recognition (Phase 11): subscription pro-rata and
 * time-based ads pro-rata via recognize_period_revenue per tenant.
 * CPC/impression ads recognize on spend via DB trigger (migration 863).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

type TenantRow = { id: string };

const JOB_NAME = "recognize-period-revenue";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const periodEnd = new Date();
  periodEnd.setUTCHours(0, 0, 0, 0);
  const periodStart = new Date(periodEnd.getTime() - 86400000);

  const { data: tenants, error: tenantError } = await supabase
    .from("tenants")
    .select("id")
    .eq("status", "active");

  if (tenantError) {
    console.error("[cron/recognize-period-revenue] tenant list failed:", tenantError);
    return NextResponse.json({ error: tenantError.message }, { status: 500 });
  }

  const results: Array<{
    tenant_id: string;
    recognized_count: number;
    recognized_amount: number;
    error?: string;
  }> = [];

  for (const tenant of (tenants ?? []) as TenantRow[]) {
    const { data, error } = await (supabase.rpc as CallableFunction)("recognize_period_revenue", {
      p_tenant_id: tenant.id,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
    });

    if (error) {
      results.push({
        tenant_id: tenant.id,
        recognized_count: 0,
        recognized_amount: 0,
        error: error.message,
      });
      continue;
    }

    const row = Array.isArray(data) ? data[0] : data;
    results.push({
      tenant_id: tenant.id,
      recognized_count: Number((row as { recognized_count?: number })?.recognized_count ?? 0),
      recognized_amount: Number((row as { recognized_amount?: number })?.recognized_amount ?? 0),
    });
  }

  const totalCount = results.reduce((s, r) => s + r.recognized_count, 0);
  const totalAmount = results.reduce((s, r) => s + r.recognized_amount, 0);

  return NextResponse.json({
    ok: true,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    tenants_processed: results.length,
    total_recognized_count: totalCount,
    total_recognized_amount: totalAmount,
    results,
  });
}
