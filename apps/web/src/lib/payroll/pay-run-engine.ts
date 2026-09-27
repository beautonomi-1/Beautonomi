import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateStaffCommission } from "./commission-calculator";
import { getTipsByStaff } from "./tips-helper";
import { sumStaffEarningsLines } from "./staff-earnings-from-lines";
import { resolvePayPeriodBounds, toPayPeriodDateString } from "./period-bounds";
import { getProviderPayrollTimezone } from "./provider-payroll-context";
import { prorateMonthlySalary } from "./salary-proration";
import { buildPayRunItem } from "./gross-pay-assembler";
import { applyStatutoryToPayRunItems } from "./apply-statutory";
import { loadStaffPayrollMetaBatch } from "./resolve-staff-payroll-meta";
import { computeCompensation } from "./compute-compensation";

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
  netPay: number;
  carryForwardOut?: number;
}

export type PayPeriodType = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "custom";

/**
 * Calculate pay run for staff of a provider (active + anyone with earnings/hours in period).
 */
export type CalculatePayRunOptions = {
  /** Override provider_settings.payroll_v2_enabled for parallel comparison. */
  forcePayrollV2?: boolean;
};

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
  const payrollMetaByStaff = await loadStaffPayrollMetaBatch(
    supabaseAdmin,
    providerId,
    eligibleIds,
    periodEnd,
    providerCountry,
  );

  const results: PayRunItem[] = [];
  const staffMeta = new Map<
    string,
    {
      jurisdictionCode: string;
      employmentType: "employee" | "contractor" | "apprentice";
      statutoryMode: "auto" | "manual" | "none";
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

    const commissionAdjustments =
      linesSummary?.adjustment_breakdown?.commission ?? linesSummary?.adjustments ?? 0;
    const tipAdjustments = linesSummary?.adjustment_breakdown?.tips ?? 0;
    const useLinesPath =
      linesSummary &&
      (linesSummary.commission !== 0 ||
        linesSummary.tips !== 0 ||
        linesSummary.adjustments !== 0);

    let commission;
    if (useLinesPath) {
      const productCalc = await calculateStaffCommission(
        supabaseAdmin,
        providerId,
        staff.id,
        periodFrom,
        periodTo,
      );
      const rawCommission =
        linesSummary.commission + commissionAdjustments + productCalc.productCommission;
      commission = {
        totalCommission: rawCommission,
        totalBookings: 0,
        serviceCommission: linesSummary.commission,
        productCommission: productCalc.productCommission,
        serviceRevenue: 0,
        productRevenue: productCalc.productRevenue,
        totalRevenue: 0,
      };
    } else {
      commission = await calculateStaffCommission(
        supabaseAdmin,
        providerId,
        staff.id,
        periodFrom,
        periodTo,
      );
    }

    const hours = hoursByStaff.get(staff.id) || 0;
    const plan = meta?.payPlan;
    const hourlyRate = Number(plan?.hourlyRate ?? staff.hourly_rate ?? 0);
    const salary = Number(
      plan?.payModel === "salary" && plan.baseMonthly != null
        ? plan.baseMonthly
        : staff.salary ?? 0,
    );
    let commissionAmount =
      (staff as { commission_enabled?: boolean | null }).commission_enabled !== false
        ? commission.totalCommission
        : 0;
    if (commissionAmount < 0) commissionAmount = 0;

    const hourlyAmount = hours * hourlyRate;
    const salaryAmount =
      salary > 0
        ? prorateMonthlySalary(salary, periodStart, periodEnd, {
            employmentStart: (staff as { employment_start_date?: string | null }).employment_start_date,
            employmentEnd: (staff as { employment_end_date?: string | null }).employment_end_date,
          })
        : 0;

    if (plan && !useLinesPath && plan.payModel !== "hourly" && plan.payModel !== "salary") {
      const compLines = computeCompensation(
        plan,
        {
          serviceRevenue: commission.serviceRevenue,
          productRevenue: commission.productRevenue,
          serviceCommissionFromLedger: linesSummary?.commission,
          productCommissionFromLedger: commission.productCommission,
          hoursWorked: hours,
        },
        salaryAmount,
      );
      const fromPlan = compLines
        .filter(
          (l) =>
            l.code === "commission" ||
            l.code.startsWith("commission") ||
            l.code === "salary_guarantee",
        )
        .reduce((s, l) => s + l.amount, 0);
      if (fromPlan > 0) {
        commissionAmount = Math.max(0, fromPlan);
      }
    }

    const staffTipsEnabled = (staff as { tips_enabled?: boolean | null }).tips_enabled !== false;
    const tipsFromLines = Math.max(0, (linesSummary?.tips ?? 0) + tipAdjustments);
    const tipsAmount = staffTipsEnabled
      ? (linesSummary?.tips ?? 0) > 0
        ? tipsFromLines
        : tipsByStaff.get(staff.id) || 0
      : 0;

    const draft = buildPayRunItem(
      staff.id,
      (staff.users as { full_name?: string } | null)?.full_name || "Unknown",
      {
        commissionAmount,
        hourlyAmount,
        salaryAmount,
        tipsAmount,
      },
      {},
    );

    const jurisdictionCode = (meta?.jurisdictionCode ?? providerCountry ?? "").trim();
    staffMeta.set(staff.id, {
      jurisdictionCode,
      employmentType: meta?.employmentType ?? "employee",
      statutoryMode:
        meta?.statutoryMode ??
        (jurisdictionCode ? "auto" : "manual"),
    });

    results.push({
      staffId: draft.staffId,
      staffName: draft.staffName,
      grossPay: draft.grossPay,
      commissionAmount: draft.commissionAmount,
      hourlyAmount: draft.hourlyAmount,
      salaryAmount: draft.salaryAmount,
      tipsAmount: draft.tipsAmount,
      manualDeductions: draft.manualDeductions,
      taxDeduction: draft.taxDeduction,
      uifContribution: draft.uifContribution,
      netPay: draft.netPay,
      ...(draft.carryForwardOut != null ? { carryForwardOut: draft.carryForwardOut } : {}),
    });
  }

  if (payrollV2 && results.length > 0) {
    return applyStatutoryToPayRunItems(
      supabaseAdmin,
      providerId,
      periodEnd,
      results,
      staffMeta,
    );
  }

  return results;
}
