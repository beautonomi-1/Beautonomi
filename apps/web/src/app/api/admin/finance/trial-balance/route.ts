import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/finance/trial-balance
 *
 * Returns the platform's GL trial balance for a given date range. Each account shows:
 *   opening_balance  — balance as at start (exclusive of period)
 *   period_debits    — total debits posted in [start, end]
 *   period_credits   — total credits posted in [start, end]
 *   closing_balance  — opening + net period movement (signed to account's normal side)
 *
 * The trial balance is inherently self-validating:
 *   Σ debits == Σ credits for any balanced period (each journal entry is balanced).
 *   `balanced: true` in the response confirms this assertion passes.
 *
 * Period-locked periods: if a `financial_period_lock` exists that covers [start, end],
 *   the response includes `period_locked: true` so the export can be marked immutable.
 *
 * Query params:
 *   start    ISO datetime (defaults to start of current month)
 *   end      ISO datetime (defaults to now)
 *   format   "json" (default) | "csv"
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startISO = searchParams.get("start") ?? defaultStart.toISOString();
    const endISO = searchParams.get("end") ?? now.toISOString();
    const format = searchParams.get("format") ?? "json";

    // ── Opening balances: all journal entries strictly before `start` ────────
    const { data: openingLines, error: openingErr } = await supabase
      .from("journal_lines")
      .select(
        `
        account_id,
        side,
        reporting_amount,
        journal_entries!inner(tenant_id, posted_at)
        `
      )
      .eq("journal_entries.tenant_id", tenantId)
      .lt("journal_entries.posted_at", startISO);
    if (openingErr) throw openingErr;

    // ── Period lines: journal entries within [start, end] ─────────────────────
    const { data: periodLines, error: periodErr } = await supabase
      .from("journal_lines")
      .select(
        `
        account_id,
        side,
        reporting_amount,
        journal_entries!inner(tenant_id, posted_at, source, description, external_ref),
        gl_accounts!inner(code, name, type, normal_side)
        `
      )
      .eq("journal_entries.tenant_id", tenantId)
      .gte("journal_entries.posted_at", startISO)
      .lte("journal_entries.posted_at", endISO);
    if (periodErr) throw periodErr;

    // ── GL accounts ───────────────────────────────────────────────────────────
    const { data: accounts, error: acctErr } = await supabase
      .from("gl_accounts")
      .select("id, code, name, type, normal_side")
      .order("code", { ascending: true });
    if (acctErr) throw acctErr;

    // ── Aggregate opening balances ────────────────────────────────────────────
    const openingByAccount: Record<string, { debits: number; credits: number }> = {};
    for (const line of openingLines ?? []) {
      const id = line.account_id as string;
      if (!openingByAccount[id]) openingByAccount[id] = { debits: 0, credits: 0 };
      if (line.side === "debit")  openingByAccount[id].debits  += Number(line.reporting_amount);
      else                        openingByAccount[id].credits += Number(line.reporting_amount);
    }

    // ── Aggregate period movements ────────────────────────────────────────────
    const periodByAccount: Record<string, { debits: number; credits: number }> = {};
    for (const line of periodLines ?? []) {
      const id = line.account_id as string;
      if (!periodByAccount[id]) periodByAccount[id] = { debits: 0, credits: 0 };
      if (line.side === "debit")  periodByAccount[id].debits  += Number(line.reporting_amount);
      else                        periodByAccount[id].credits += Number(line.reporting_amount);
    }

    // ── Build trial balance rows ──────────────────────────────────────────────
    type TrialBalanceRow = {
      account_code: string;
      account_name: string;
      account_type: string;
      normal_side: string;
      opening_balance: number;
      period_debits: number;
      period_credits: number;
      closing_balance: number;
    };

    const signedBalance = (normalSide: string, debits: number, credits: number) =>
      normalSide === "debit" ? debits - credits : credits - debits;

    const rows: TrialBalanceRow[] = (accounts ?? []).map((acct) => {
      const ob = openingByAccount[acct.id] ?? { debits: 0, credits: 0 };
      const pb = periodByAccount[acct.id] ?? { debits: 0, credits: 0 };
      const openingBalance = signedBalance(acct.normal_side, ob.debits, ob.credits);
      const closingBalance = openingBalance + signedBalance(acct.normal_side, pb.debits, pb.credits);
      return {
        account_code: acct.code,
        account_name: acct.name,
        account_type: acct.type,
        normal_side: acct.normal_side,
        opening_balance: openingBalance,
        period_debits: pb.debits,
        period_credits: pb.credits,
        closing_balance: closingBalance,
      };
    });

    // ── Self-validating assert ────────────────────────────────────────────────
    const totalDebits  = rows.reduce((s, r) => s + r.period_debits, 0);
    const totalCredits = rows.reduce((s, r) => s + r.period_credits, 0);
    const balanced = Math.abs(totalDebits - totalCredits) < 0.005;

    // ── Check period lock ─────────────────────────────────────────────────────
    const { data: lockRows } = await supabase
      .from("financial_period_locks")
      .select("id, period_start, period_end, locked_by")
      .eq("tenant_id", tenantId)
      .lte("period_start", startISO)
      .gte("period_end", endISO)
      .limit(1);
    const periodLock = lockRows?.[0] ?? null;

    // ── CSV export ────────────────────────────────────────────────────────────
    if (format === "csv") {
      const headers = [
        "account_code", "account_name", "account_type", "normal_side",
        "opening_balance", "period_debits", "period_credits", "closing_balance",
      ];
      const csvLines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            r.account_code,
            `"${r.account_name.replace(/"/g, '""')}"`,
            r.account_type,
            r.normal_side,
            r.opening_balance.toFixed(2),
            r.period_debits.toFixed(2),
            r.period_credits.toFixed(2),
            r.closing_balance.toFixed(2),
          ].join(",")
        ),
        // Totals row
        [
          "TOTAL", "", "", "",
          rows.reduce((s, r) => s + r.opening_balance, 0).toFixed(2),
          totalDebits.toFixed(2),
          totalCredits.toFixed(2),
          rows.reduce((s, r) => s + r.closing_balance, 0).toFixed(2),
        ].join(","),
      ];
      const csvBody = csvLines.join("\r\n");
      const filename = `trial-balance-${startISO.slice(0, 10)}-to-${endISO.slice(0, 10)}.csv`;
      return new NextResponse(csvBody, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      data: {
        period: { start: startISO, end: endISO },
        rows,
        totals: {
          period_debits: totalDebits,
          period_credits: totalCredits,
        },
        balanced,
        period_locked: !!periodLock,
        period_lock: periodLock
          ? { id: periodLock.id, locked_by: periodLock.locked_by }
          : null,
        generated_at: new Date().toISOString(),
        basis_note:
          "Trial balance is sourced from the shadow double-entry GL " +
          "(journal_lines × journal_entries). Each entry must balance; " +
          "`balanced: true` confirms Σ period_debits = Σ period_credits.",
      },
      error: null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate trial balance");
  }
}
