/**
 * GET /api/cron/reconciliation-gate
 *
 * §15.4-30 (audit 2026-04) — 24h ledger reconciliation gate.
 *
 * Runs `ledger_reconciliation_summary(p_from, p_to)` over the last 24h, then
 * records the outcome in `public.reconciliation_gate_runs` with:
 *   - `balanced`  : legacy rows fully shadowed AND no imbalanced journal
 *                   entries AND debit/credit sums are equal.
 *   - `drifted`   : any of the above checks failed (with a drift_summary).
 *   - `error`     : the RPC threw.
 *
 * Feature flags / rollout gates can read the most recent row and refuse to
 * advance unless `status = 'balanced'`.
 *
 * Meant for a daily Vercel cron.
 */

import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

type SummaryRow = {
  legacy_row_count: number | string | null;
  shadowed_row_count: number | string | null;
  missing_row_count: number | string | null;
  imbalanced_entry_count: number | string | null;
  legacy_sum_abs: number | string | null;
  ledger_sum_debits: number | string | null;
  ledger_sum_credits: number | string | null;
};

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
};

export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    try {
      // Wave 1.1: opportunistically self-heal before measuring. Absorbs
      // transient races where the shadow trigger ran after the legacy
      // insert was first read by the cron.
      let healed = 0;
      try {
        const { data: healedData } = await (supabase.rpc as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: number | null; error: { message: string } | null }>)(
          "reconciliation_self_heal",
          { p_from: from.toISOString(), p_to: to.toISOString() },
        );
        healed = toNum(healedData);
      } catch (healErr) {
        Sentry.captureException(healErr, { tags: { alert: "reconciliation_self_heal_failed" } });
      }

      const { data, error } = await (supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: SummaryRow[] | null; error: { message: string } | null }>)(
        "ledger_reconciliation_summary",
        { p_from: from.toISOString(), p_to: to.toISOString() },
      );

      if (error) throw new Error(error.message);

      const row = Array.isArray(data) ? data[0] : (data as SummaryRow | null);
      const missing = toNum(row?.missing_row_count);
      const imbalanced = toNum(row?.imbalanced_entry_count);
      const debits = toNum(row?.ledger_sum_debits);
      const credits = toNum(row?.ledger_sum_credits);

      const debitCreditDrift = Math.abs(debits - credits);
      const driftRows = missing + imbalanced + (debitCreditDrift > 0.005 ? 1 : 0);
      const status = driftRows === 0 ? "balanced" : "drifted";

      const driftSummary = {
        legacy_row_count: toNum(row?.legacy_row_count),
        shadowed_row_count: toNum(row?.shadowed_row_count),
        missing_row_count: missing,
        imbalanced_entry_count: imbalanced,
        legacy_sum_abs: toNum(row?.legacy_sum_abs),
        ledger_sum_debits: debits,
        ledger_sum_credits: credits,
        debit_credit_drift: debitCreditDrift,
        self_healed_rows: healed,
      };

      await supabase.from("reconciliation_gate_runs").insert({
        window_start: from.toISOString(),
        window_end: to.toISOString(),
        status,
        drift_rows: driftRows,
        drift_summary: driftSummary,
      });

      // §Final-audit 2026-04: escalate drift to Sentry so finance / ops
      // are paged rather than having to poll the reconciliation_gate_runs
      // table. Balanced runs are quiet.
      if (status === "drifted") {
        Sentry.captureMessage("Ledger reconciliation drift detected", {
          level: "error",
          extra: {
            window_start: from.toISOString(),
            window_end: to.toISOString(),
            drift_rows: driftRows,
            ...driftSummary,
          },
          tags: { alert: "reconciliation_drift" },
        });
      }

      return successResponse({
        window_start: from.toISOString(),
        window_end: to.toISOString(),
        status,
        drift_rows: driftRows,
        self_healed_rows: healed,
      });
    } catch (rpcErr) {
      await supabase.from("reconciliation_gate_runs").insert({
        window_start: from.toISOString(),
        window_end: to.toISOString(),
        status: "error",
        drift_rows: 0,
        drift_summary: {},
        notes: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
      });
      Sentry.captureException(rpcErr, {
        tags: { alert: "reconciliation_error" },
        extra: {
          window_start: from.toISOString(),
          window_end: to.toISOString(),
        },
      });
      throw rpcErr;
    }
  } catch (error) {
    return handleApiError(error, "Failed to run reconciliation gate");
  }
}
