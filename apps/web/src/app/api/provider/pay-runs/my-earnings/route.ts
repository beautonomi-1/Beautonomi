import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sumStaffEarningsLines,
  summarizeStaffEarningsLines,
  splitStaffEarningsLinesBySettlement,
  describeEarningsAdjustment,
  isAdjustmentLine,
  type StaffEarningsLineLite,
  type PayRunPeriod,
} from "@/lib/payroll/staff-earnings-from-lines";
import { startOfDay, startOfWeek, startOfMonth, endOfDay, subDays } from "date-fns";

const SETTLEMENT_LOOKBACK_DAYS = 120;

/**
 * GET /api/provider/pay-runs/my-earnings
 * Staff: pay stubs + live commission/tips from staff_earnings_lines, plus a
 * pending / approved / paid split (by pay-run period) and recent adjustments
 * with a human-readable reason (reversal, reassignment, refund clawback…).
 *
 * Scope: always the caller's own provider_staff row — never another member's lines.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: staff } = await supabaseAdmin
      .from("provider_staff")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!staff) {
      return successResponse({ pay_stubs: [], live: null, settlement: null, adjustments: [] });
    }

    const now = new Date();
    const periods = {
      today: { from: startOfDay(now), to: endOfDay(now) },
      week: { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) },
      month: { from: startOfMonth(now), to: endOfDay(now) },
    };

    const live: Record<string, Awaited<ReturnType<typeof sumStaffEarningsLines>>> = {};
    for (const [key, range] of Object.entries(periods)) {
      live[key] = await sumStaffEarningsLines(
        supabaseAdmin,
        staff.id,
        range.from,
        range.to,
      ).catch(() => ({ commission: 0, tips: 0, adjustments: 0, total: 0 }));
    }

    // Lines in the lookback window → pending / approved / paid split + adjustments.
    const lookbackFrom = startOfDay(subDays(now, SETTLEMENT_LOOKBACK_DAYS));
    const { data: recentLinesRaw } = await supabaseAdmin
      .from("staff_earnings_lines")
      .select("id, kind, amount, created_at, reason, metadata, booking_id, rate_source")
      .eq("staff_id", staff.id)
      .eq("provider_id", providerId)
      .gte("created_at", lookbackFrom.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);
    const recentLines = (recentLinesRaw ?? []) as StaffEarningsLineLite[];

    const { data: items } = await supabaseAdmin
      .from("provider_pay_run_items")
      .select("id, pay_run_id, gross_pay, commission_amount, hourly_amount, salary_amount, tips_amount, manual_deductions, tax_deduction, uif_contribution, net_pay, notes")
      .eq("staff_id", staff.id)
      .limit(50);

    const payRunIds = [...new Set((items || []).map((i: { pay_run_id: string }) => i.pay_run_id).filter(Boolean))];
    const payRunMap = new Map<string, Record<string, unknown>>();
    if (payRunIds.length > 0) {
      const { data: payRuns } = await supabaseAdmin
        .from("provider_pay_runs")
        .select("id, pay_period_start, pay_period_end, status, created_at, approved_at, paid_at, payment_reference")
        .eq("provider_id", providerId)
        .in("id", payRunIds);
      for (const pr of payRuns || []) {
        payRunMap.set((pr as { id: string }).id, pr as Record<string, unknown>);
      }
    }

    const payRunPeriods: PayRunPeriod[] = [...payRunMap.values()].map((pr) => ({
      id: String(pr.id),
      status: String(pr.status ?? "draft"),
      pay_period_start: String(pr.pay_period_start ?? ""),
      pay_period_end: String(pr.pay_period_end ?? ""),
    }));

    const settlement = {
      ...splitStaffEarningsLinesBySettlement(recentLines, payRunPeriods),
      lookback_days: SETTLEMENT_LOOKBACK_DAYS,
      all: summarizeStaffEarningsLines(recentLines),
    };

    const adjustments = recentLines
      .filter(isAdjustmentLine)
      .slice(0, 50)
      .map((line) => ({
        id: line.id,
        kind: line.kind,
        amount: Number(line.amount ?? 0),
        created_at: line.created_at,
        booking_id: line.booking_id ?? null,
        reason: describeEarningsAdjustment(line),
      }));

    const payStubs = (items || [])
      .map((i: Record<string, unknown>) => {
        const pr = payRunMap.get(i.pay_run_id as string);
        if (!pr) return null;
        return {
          pay_run_id: pr.id,
          pay_period_start: pr.pay_period_start,
          pay_period_end: pr.pay_period_end,
          status: pr.status,
          created_at: pr.created_at,
          paid_at: pr.paid_at ?? null,
          payment_reference: pr.payment_reference ?? null,
          gross_pay: i.gross_pay,
          commission_amount: i.commission_amount,
          hourly_amount: i.hourly_amount,
          salary_amount: i.salary_amount,
          tips_amount: i.tips_amount,
          manual_deductions: i.manual_deductions,
          tax_deduction: i.tax_deduction,
          uif_contribution: i.uif_contribution,
          net_pay: i.net_pay,
          notes: i.notes,
        };
      })
      .filter(Boolean)
      .sort(
        (a: any, b: any) =>
          new Date(b.pay_period_end).getTime() - new Date(a.pay_period_end).getTime(),
      )
      .slice(0, 24);

    return successResponse({ pay_stubs: payStubs, live, settlement, adjustments });
  } catch (error) {
    return handleApiError(error, "Failed to load my earnings");
  }
}
