/**
 * GET /api/cron/gl-currency-drift
 * Multi-currency shadow reconciliation: detect per-(tenant, currency) GL drift and
 * open reconciliation_exceptions so finance ops can triage before cutover.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type DriftRow = {
  tenant_id: string;
  raw_currency: string;
  reporting_currency: string;
  entry_count: number;
  raw_drift: number;
  reporting_drift: number;
  last_posted_at: string | null;
};

const JOB_NAME = "gl-currency-drift";
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
  const tolerance = 0.01;

  const { data, error } = await (supabase.rpc as any)("gl_currency_drift_exceptions", {
    p_tolerance: tolerance,
  });

  if (error) {
    console.error("[cron/gl-currency-drift] rpc failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as DriftRow[];
  const recorded: unknown[] = [];

  for (const row of rows) {
    if (!row.tenant_id) continue;
    const mismatchReason = `GL drift in ${row.raw_currency}: raw_drift=${row.raw_drift}, reporting_drift=${row.reporting_drift} across ${row.entry_count} entries`;

    // Idempotent per day: don't duplicate an open drift exception for the same tenant/currency.
    const { data: existing } = await supabase
      .from("reconciliation_exceptions")
      .select("id")
      .eq("tenant_id", row.tenant_id)
      .eq("currency", row.raw_currency)
      .eq("psp", "ledger")
      .eq("source", "ledger")
      .eq("status", "open")
      .maybeSingle();

    if (existing) {
      recorded.push({ tenant_id: row.tenant_id, currency: row.raw_currency, skipped: "already_open" });
      continue;
    }

    const { error: insertError } = await supabase.from("reconciliation_exceptions").insert({
      tenant_id: row.tenant_id,
      currency: row.raw_currency,
      psp: "ledger",
      source: "ledger",
      amount: row.raw_drift,
      status: "open",
      mismatch_reason: mismatchReason,
      metadata: {
        reporting_currency: row.reporting_currency,
        reporting_drift: row.reporting_drift,
        entry_count: row.entry_count,
        last_posted_at: row.last_posted_at,
        detector: "gl_currency_drift_cron",
      },
    });

    recorded.push({
      tenant_id: row.tenant_id,
      currency: row.raw_currency,
      ok: !insertError,
      error: insertError?.message,
    });
  }

  return NextResponse.json({ ok: true, drift_rows: rows.length, recorded });
}
