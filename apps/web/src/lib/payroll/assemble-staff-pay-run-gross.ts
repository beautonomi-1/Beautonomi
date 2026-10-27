import type { PayPlanSnapshot } from "./compute-compensation";
import {
  computeCompensation,
  sumCompensationLines,
  type CompensationLine,
} from "./compute-compensation";
import { buildPayRunItem, type PayRunItemDraft } from "./gross-pay-assembler";
import { prorateMonthlySalary } from "./salary-proration";
import type { StaffEarningsSummary } from "./staff-earnings-from-lines";

export type StaffCommissionCalc = {
  totalCommission: number;
  serviceCommission: number;
  productCommission: number;
  serviceRevenue: number;
  productRevenue: number;
};

export type AssembleStaffPayRunGrossInput = {
  staffId: string;
  staffName: string;
  commissionEnabled: boolean;
  tipsEnabled: boolean;
  hoursWorked: number;
  /** Legacy staff row when no pay plan rate. */
  hourlyRateFallback: number;
  salaryFallback: number;
  employmentStart?: string | null;
  employmentEnd?: string | null;
  periodStart: string;
  periodEnd: string;
  payPlan: PayPlanSnapshot | null;
  productCalc: StaffCommissionCalc;
  linesSummary: StaffEarningsSummary | null;
  tipsFromPeriod: number;
  /** Negative balance from prior run carry_forward_out. */
  carryForwardBalance?: number;
};

export type AssembledStaffGross = PayRunItemDraft & {
  commissionClawback: number;
  carryForwardIn: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasLedgerActivity(summary: StaffEarningsSummary | null): boolean {
  if (!summary) return false;
  return (
    summary.commission !== 0 ||
    summary.tips !== 0 ||
    summary.adjustments !== 0
  );
}

/**
 * Pure gross assembly for one staff member: commission calculator always runs;
 * ledger adds adjustments only (no double product commission); pay plan drives gross.
 */
export function assembleStaffPayRunGross(input: AssembleStaffPayRunGrossInput): AssembledStaffGross {
  const linesActive = hasLedgerActivity(input.linesSummary);
  const commissionAdjustments =
    input.linesSummary?.adjustment_breakdown?.commission ??
    input.linesSummary?.adjustments ??
    0;
  const tipAdjustments = input.linesSummary?.adjustment_breakdown?.tips ?? 0;

  const serviceCommission = linesActive
    ? (input.linesSummary?.commission ?? 0)
    : input.productCalc.serviceCommission;
  const productCommission = input.productCalc.productCommission;
  let commissionAmount =
    serviceCommission + productCommission + commissionAdjustments;

  const commissionClawback = round2(
    commissionAdjustments < 0 ? Math.abs(commissionAdjustments) : 0,
  );

  const plan = input.payPlan;
  const hourlyRate = Number(plan?.hourlyRate ?? input.hourlyRateFallback ?? 0);
  const salaryMonthly =
    plan?.payModel === "salary" && plan.baseMonthly != null
      ? Number(plan.baseMonthly)
      : plan
        ? 0
        : Number(input.salaryFallback ?? 0);

  const proratedSalary =
    salaryMonthly > 0
      ? prorateMonthlySalary(salaryMonthly, input.periodStart, input.periodEnd, {
          employmentStart: input.employmentStart,
          employmentEnd: input.employmentEnd,
        })
      : plan &&
          (plan.payModel === "base_plus_commission" ||
            plan.payModel === "base_or_commission_higher") &&
          plan.baseMonthly != null
        ? prorateMonthlySalary(Number(plan.baseMonthly), input.periodStart, input.periodEnd, {
            employmentStart: input.employmentStart,
            employmentEnd: input.employmentEnd,
          })
        : 0;

  let hourlyAmount = input.hoursWorked * hourlyRate;
  let salaryAmount = proratedSalary;

  if (plan) {
    const compLines: CompensationLine[] = computeCompensation(
      plan,
      {
        serviceRevenue: input.productCalc.serviceRevenue,
        productRevenue: input.productCalc.productRevenue,
        serviceCommissionFromLedger: linesActive ? serviceCommission : undefined,
        productCommissionFromLedger: productCommission,
        hoursWorked: input.hoursWorked,
      },
      proratedSalary,
    );
    const fromPlan = sumCompensationLines(compLines);
    if (fromPlan > 0) {
      commissionAmount = 0;
      hourlyAmount = 0;
      salaryAmount = 0;
      for (const line of compLines) {
        if (line.code === "hourly") hourlyAmount += line.amount;
        else if (line.code === "salary" || line.code === "salary_guarantee") salaryAmount += line.amount;
        else commissionAmount += line.amount;
      }
      commissionAmount += commissionAdjustments;
    } else if (
      plan.payModel !== "hourly" &&
      plan.payModel !== "salary" &&
      plan.payModel !== "hourly_plus_commission" &&
      plan.payModel !== "base_plus_commission"
    ) {
      commissionAmount = Math.max(0, fromPlan + commissionAdjustments);
      hourlyAmount = 0;
      salaryAmount = 0;
    }
  } else if (!linesActive) {
    commissionAmount = input.productCalc.totalCommission;
  }

  if (!input.commissionEnabled) {
    commissionAmount = 0;
  } else if (commissionAmount < 0) {
    commissionAmount = 0;
  }

  const tipsFromLines = Math.max(0, (input.linesSummary?.tips ?? 0) + tipAdjustments);
  const tipsAmount = input.tipsEnabled
    ? (input.linesSummary?.tips ?? 0) !== 0 || tipAdjustments !== 0
      ? tipsFromLines
      : input.tipsFromPeriod
    : 0;

  const carryForwardBalance = Number(input.carryForwardBalance) || 0;
  const carryForwardIn = carryForwardBalance < 0 ? round2(Math.abs(carryForwardBalance)) : 0;

  const draft = buildPayRunItem(
    input.staffId,
    input.staffName,
    {
      commissionAmount: round2(commissionAmount),
      hourlyAmount: round2(hourlyAmount),
      salaryAmount: round2(salaryAmount),
      tipsAmount: round2(tipsAmount),
    },
    { carryForwardBalance },
  );

  return {
    ...draft,
    commissionClawback,
    carryForwardIn,
  };
}
