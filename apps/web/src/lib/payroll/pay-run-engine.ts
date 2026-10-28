import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateStaffCommission } from "./commission-calculator";
import { getTipsByStaff } from "./tips-helper";
import { sumStaffEarningsLines } from "./staff-earnings-from-lines";
import { resolvePayPeriodBounds, toPayPeriodDateString } from "./period-bounds";
import { getProviderPayrollTimezone } from "./provider-payroll-context";
import { assembleStaffPayRunGross } from "./assemble-staff-pay-run-gross";
import { applyStatutoryToPayRunItems } from "./apply-statutory";
import { loadStaffPayrollMetaBatch } from "./resolve-staff-payroll-meta";

export interface PayRunItem {
  staffId: string;
  staffName: string;
  grossPay: number;
  commissionAmount: number;
  hourlyAmount: number;
  salaryAmount: number;
  tipsAmount: number;
  manualDeductions: number;
  taxDeduction: number;
  uifContribution: number;
  taxableIncome?: number;
  netPay: number;
  commissionClawback?: number;
  carryForwardIn?: number;
  carryForwardOut?: number;
}

export type PayPeriodType = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "custom";

export type CalculatePayRunOptions = {
  forcePayrollV2?: boolean;
};

async function loadStaffCarryForwardBalances(
  admin: SupabaseClient,
  providerId: string,
  staffIds: string[],
  periodStart: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!staffIds.length) return out;

  const { data: priorRuns } = await admin
    .from("provider_pay_runs")
    .select("id, pay_period_end")
    .eq("provider_id", providerId)
    .in("status", ["approved", "paid"])
    .lt("pay_period_end", periodStart)
    .order("pay_period_end", { ascending: false })
    .limit(20);

  const runIds = (priorRuns ?? []).map((r: { id: string }) => r.id);
  if (!runIds.length) return out;

  const { data: items } = await admin
    .from("provider_pay_run_items")
    .select("staff_id, carry_forward_out, pay_run_id")
    .in("staff_id", staffIds)
    .in("pay_run_id", runIds)
    .gt("carry_forward_out", 0);

  const runOrder = new Map(runIds.map((id, i) => [id, i]));
  const best = new Map<string, { order: number; out: number }>();
  for (const row of items ?? []) {
    const sid = (row as { staff_id: string }).staff_id;
    const rid = (row as { pay_run_id: string }).pay_run_id;
    const order = runOrder.get(rid) ?? 999;
    const cfOut = Number((row as { carry_forward_out?: number }).carry_forward_out ?? 0);
    const prev = best.get(sid);
    if (!prev || order < prev.order) {
      best.set(sid, { order, out: cfOut });
    }
  }
  for (const [sid, v] of best) {
    out.set(sid, -v.out);
  }
  return out;
}

export async function calculatePayRun(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  periodStartInput: Date | string,
  periodEndInput: Date | string,
  periodType: PayPeriodType = "weekly",
  options?: CalculatePayRunOptions,
): Promise<PayRunItem[]> {
  const periodStart = toPayPeriodDateString(periodStartInput);
  const periodEnd = toPayPeriodDateString(periodEndInput);
  const timezone = await getProviderPayrollTimezone(supabaseAdmin, providerId);
  const { from: periodFrom, to: periodTo } = resolvePayPeriodBounds(
    periodStart,
    periodEnd,
    timezone,
  );

  const { data: staffMembers } = await supabaseAdmin
    .from("provider_staff")
    .select(
      "id, user_id, commission_enabled, hourly_rate, salary, tips_enabled, employment_start_date, employment_end_date, is_active, users(full_name)",
    )
    .eq("provider_id", providerId)
    .is("deleted_at", null);

  if (!staffMembers?.length) return [];

  const staffIds = staffMembers.map((s: { id: string }) => s.id);

  const { data: timeCards } = await supabaseAdmin
    .from("staff_time_cards")
    .select("staff_id, total_hours")
    .in("staff_id", staffIds)
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .not("total_hours", "is", null);

  const hoursByStaff = new Map<string, number>();
  for (const tc of timeCards || []) {
    const s = (tc as { staff_id: string }).staff_id;
    hoursByStaff.set(s, (hoursByStaff.get(s) || 0) + Number((tc as { total_hours?: number }).total_hours || 0));
  }

  const { data: linesInPeriod } = await supabaseAdmin
    .from("staff_earnings_lines")
    .select("staff_id")
    .eq("provider_id", providerId)
    .gte("created_at", periodFrom.toISOString())
    .lte("created_at", periodTo.toISOString());

  const staffWithActivity = new Set<string>(
    (linesInPeriod ?? []).map((r: { staff_id: string }) => r.staff_id),
  );
  for (const [sid, h] of hoursByStaff) {
    if (h > 0) staffWithActivity.add(sid);
  }

  const eligibleStaff = staffMembers.filter((s: { id: string; is_active?: boolean | null }) => {
    if (s.is_active !== false) return true;
    return staffWithActivity.has(s.id);
  });

  const tipsByStaff = await getTipsByStaff(
    supabaseAdmin,
    providerId,
    periodFrom,
    periodTo,
  );

  const [{ data: payrollSettings }, { data: providerRow }] = await Promise.all([
    supabaseAdmin
      .from("provider_settings")
      .select("payroll_v2_enabled")
      .eq("provider_id", providerId)
      .maybeSingle(),
    supabaseAdmin.from("providers").select("country_code").eq("id", providerId).maybeSingle(),
  ]);
  const payrollV2 =
    options?.forcePayrollV2 !== undefined
      ? options.forcePayrollV2
      : (payrollSettings as { payroll_v2_enabled?: boolean } | null)?.payroll_v2_enabled === true;
  const providerCountry =
    (providerRow as { country_code?: string | null } | null)?.country_code?.trim().toUpperCase() ||
    null;

  const eligibleIds = eligibleStaff.map((s: { id: string }) => s.id);
  const [payrollMetaByStaff, carryForwardByStaff] = await Promise.all([
    loadStaffPayrollMetaBatch(
      supabaseAdmin,
      providerId,
      eligibleIds,
      periodEnd,
      providerCountry,
    ),
    loadStaffCarryForwardBalances(supabaseAdmin, providerId, eligibleIds, periodStart),
  ]);

  const results: PayRunItem[] = [];
  const staffMeta = new Map<
    string,
    {
      jurisdictionCode: string;
      employmentType: "employee" | "contractor" | "apprentice";
      statutoryMode: "auto" | "manual" | "none";
      userId?: string | null;
    }
  >();

  for (const staff of eligibleStaff) {
    const meta = payrollMetaByStaff.get(staff.id);
    if (meta?.payPlan?.payModel === "booth_renter") {
      continue;
    }

    const linesSummary = await sumStaffEarningsLines(
      supabaseAdmin,
      staff.id,
      periodFrom,
      periodTo,
    ).catch(() => null);

    const productCalc = await calculateStaffCommission(
      supabaseAdmin,
      providerId,
      staff.id,
      periodFrom,
      periodTo,
    );

    const assembled = assembleStaffPayRunGross({
      staffId: staff.id,
      staffName: (staff.users as { full_name?: string } | null)?.full_name || "Unknown",
      commissionEnabled: (staff as { commission_enabled?: boolean | null }).commission_enabled !== false,
      tipsEnabled: (staff as { tips_enabled?: boolean | null }).tips_enabled !== false,
      hoursWorked: hoursByStaff.get(staff.id) || 0,
      hourlyRateFallback: Number(staff.hourly_rate ?? 0),
      salaryFallback: Number(staff.salary ?? 0),
      employmentStart: (staff as { employment_start_date?: string | null }).employment_start_date,
      employmentEnd: (staff as { employment_end_date?: string | null }).employment_end_date,
      periodStart,
      periodEnd,
      payPlan: meta?.payPlan ?? null,
      productCalc: {
        totalCommission: productCalc.totalCommission,
        serviceCommission: productCalc.serviceCommission,
        productCommission: productCalc.productCommission,
        serviceRevenue: productCalc.serviceRevenue,
        productRevenue: productCalc.productRevenue,
      },
      linesSummary,
      tipsFromPeriod: tipsByStaff.get(staff.id) || 0,
      carryForwardBalance: carryForwardByStaff.get(staff.id),
    });

    const jurisdictionCode = (meta?.jurisdictionCode ?? providerCountry ?? "").trim();
    staffMeta.set(staff.id, {
      jurisdictionCode,
      employmentType: meta?.employmentType ?? "employee",
      statutoryMode:
        meta?.statutoryMode ??
        (jurisdictionCode ? "auto" : "manual"),
      userId: (staff as { user_id?: string | null }).user_id,
    });

    results.push({
      staffId: assembled.staffId,
      staffName: assembled.staffName,
      grossPay: assembled.grossPay,
      commissionAmount: assembled.commissionAmount,
      hourlyAmount: assembled.hourlyAmount,
      salaryAmount: assembled.salaryAmount,
      tipsAmount: assembled.tipsAmount,
      manualDeductions: assembled.manualDeductions,
      taxDeduction: assembled.taxDeduction,
      uifContribution: assembled.uifContribution,
      netPay: assembled.netPay,
      commissionClawback: assembled.commissionClawback,
      carryForwardIn: assembled.carryForwardIn,
      ...(assembled.carryForwardOut != null ? { carryForwardOut: assembled.carryForwardOut } : {}),
    });
  }

  if (payrollV2 && results.length > 0) {
    return applyStatutoryToPayRunItems(
      supabaseAdmin,
      providerId,
      periodEnd,
      periodType,
      results,
      staffMeta,
    );
  }

  return results;
}
