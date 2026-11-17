import type { PayPlanSnapshot } from "./compute-compensation";
import { computeCompensation, planReturnCommission, type CompensationLine } from "./compute-compensation";
import { buildPayRunItem, type PayRunItemDraft } from "./gross-pay-assembler";
import { prorateMonthlySalary } from "./salary-proration";
import {
  ledgerServiceCommissionExcludingRetail,
  storedServiceCommissionKeepingEachVisit,
  type AdjustedVisitRetail,
  type CommissionResult,
} from "./commission-calculator";
import type { StaffEarningsSummary } from "./staff-earnings-from-lines";
import { addMoney, roundCurrency, multiplyMoney, subtractMoney } from "@beautonomi/utils";

export type StaffCommissionCalc = {
  totalCommission: number;
  serviceCommission: number;
  productCommission: number;
  serviceRevenue: number;
  productRevenue: number;
  /** Present when the calculator split override items out of the tier base. */
  serviceOverrideCommission?: number;
  serviceOverrideRevenue?: number;
  posServiceTierRevenue?: number;
  posServiceOverrideCommission?: number;
  posServiceCommission?: number;
  productOverrideCommission?: number;
  productOverrideRevenue?: number;
  serviceTierRevenue?: number;
  productTierRevenue?: number;
  appointmentProductRevenue?: number;
  serviceExcludesAppointmentRetail?: boolean;
  serviceExcludesAddons?: boolean;
  /** Service commission for visits that included a product or add-on, with that amount taken out. */
  serviceCommissionOnAdjustedBookings?: number;
  adjustedServiceKeptRevenue?: number;
  adjustedServiceExcludedRevenue?: number;
  adjustedOwnRateAddonCommission?: number;
  appointmentProductRevenueOnServicedBookings?: number;
  adjustedVisits?: AdjustedVisitRetail[];
  /** Product returned this period that was sold earlier. Kept off the tier. */
  returnCommission?: number;
  returnBaseProductRevenue?: number;
  returnBaseProductCommission?: number;
  returnBaseServiceRevenue?: number;
  returnBaseServiceCommission?: number;
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
  /** Till-sale tips. Added on top of appointment tips. */
  posSaleTips?: number;
  /** Negative balance from prior run carry_forward_out. */
  carryForwardBalance?: number;
  /** My earnings shows commission and tips. It does not apply a salary or hourly amount. */
  ignoreBasePay?: boolean;
};

export type AssembledStaffGross = PayRunItemDraft & {
  commissionClawback: number;
  carryForwardIn: number;
  /** Adjustments already included in commissionAmount. */
  includedAdjustments: number;
};

/** The sales figures the pay run and My earnings both pay on. */
export function staffCommissionCalcFromResult(calc: CommissionResult): StaffCommissionCalc {
  return {
    totalCommission: calc.totalCommission,
    serviceCommission: calc.serviceCommission,
    productCommission: calc.productCommission,
    serviceRevenue: calc.serviceRevenue,
    productRevenue: calc.productRevenue,
    serviceOverrideCommission: calc.serviceOverrideCommission,
    productOverrideCommission: calc.productOverrideCommission,
    serviceTierRevenue: calc.serviceTierRevenue,
    productTierRevenue: calc.productTierRevenue,
    appointmentProductRevenue: calc.appointmentProductRevenue,
    serviceExcludesAppointmentRetail: calc.serviceExcludesAppointmentRetail,
    serviceExcludesAddons: calc.serviceExcludesAddons,
    serviceCommissionOnAdjustedBookings: calc.serviceCommissionOnAdjustedBookings,
    adjustedServiceKeptRevenue: calc.adjustedServiceKeptRevenue,
    adjustedServiceExcludedRevenue: calc.adjustedServiceExcludedRevenue,
    adjustedOwnRateAddonCommission: calc.adjustedOwnRateAddonCommission,
    appointmentProductRevenueOnServicedBookings: calc.appointmentProductRevenueOnServicedBookings,
    adjustedVisits: calc.adjustedVisits,
    returnCommission: calc.returnCommission,
    returnBaseProductRevenue: calc.returnBaseProductRevenue,
    returnBaseProductCommission: calc.returnBaseProductCommission,
    returnBaseServiceRevenue: calc.returnBaseServiceRevenue,
    returnBaseServiceCommission: calc.returnBaseServiceCommission,
    serviceOverrideRevenue: calc.serviceOverrideRevenue,
    posServiceTierRevenue: calc.posServiceTierRevenue,
    posServiceOverrideCommission: calc.posServiceOverrideCommission,
    posServiceCommission: calc.posServiceCommission,
    productOverrideRevenue: calc.productOverrideRevenue,
  };
}

function hasLedgerActivity(summary: StaffEarningsSummary | null): boolean {
  if (!summary) return false;
  return (
    summary.commission !== 0 ||
    summary.tips !== 0 ||
    summary.adjustments !== 0 ||
    (summary.cancellationFeeShare ?? 0) !== 0
  );
}

/**
 * Pure gross assembly for one staff member: commission calculator always runs;
 * ledger adds adjustments only (no double product commission); pay plan drives gross.
 */
export function assembleStaffPayRunGross(input: AssembleStaffPayRunGrossInput): AssembledStaffGross {
  const linesActive = hasLedgerActivity(input.linesSummary);
  let commissionAdjustments =
    input.linesSummary?.adjustment_breakdown?.commission ??
    input.linesSummary?.adjustments ??
    0;
  const tipAdjustments = input.linesSummary?.adjustment_breakdown?.tips ?? 0;

  const useCalculatedService =
    input.productCalc.serviceExcludesAppointmentRetail || input.productCalc.serviceExcludesAddons;
  let serviceCommission = linesActive
    ? useCalculatedService
      ? input.productCalc.serviceCommission
      : ledgerServiceCommissionExcludingRetail(
          input.linesSummary?.commission ?? 0,
          input.productCalc.serviceRevenue,
          input.productCalc.appointmentProductRevenueOnServicedBookings ??
            input.productCalc.appointmentProductRevenue ??
            0,
        )
    : input.productCalc.serviceCommission;
  const productCommission = input.productCalc.productCommission;
  const commissionClawback = roundCurrency(
    commissionAdjustments < 0 ? Math.abs(commissionAdjustments) : 0,
  );

  const plan = input.payPlan;
  if (plan?.payModel === "booth_renter") {
    const draft = buildPayRunItem(input.staffId, input.staffName, {
      commissionAmount: 0,
      hourlyAmount: 0,
      salaryAmount: 0,
      tipsAmount: 0,
    });
    return {
      ...draft,
      commissionClawback: 0,
      carryForwardIn: 0,
      includedAdjustments: 0,
    };
  }
  const planTiers = Boolean(plan?.serviceTiers?.length || plan?.productTiers?.length);
  const usesThreshold =
    plan?.payModel === "commission_above_threshold" && plan.thresholdAmount != null;
  const samePeriodRefund = input.linesSummary?.samePeriodServiceClawback ?? 0;
  const replacedStored = input.linesSummary?.positiveCommissionOnAdjustedBookings;
  const replacement = input.productCalc.serviceCommissionOnAdjustedBookings;
  const keptRevenue = input.productCalc.adjustedServiceKeptRevenue;
  const excludedRevenue = input.productCalc.adjustedServiceExcludedRevenue;
  const keepStoredRate =
    keptRevenue != null && excludedRevenue != null && (keptRevenue > 0 || excludedRevenue > 0);
  const keepPlainStored =
    linesActive &&
    useCalculatedService &&
    replacedStored != null &&
    replacement != null &&
    !(planTiers || usesThreshold);
  if (keepPlainStored) {
    const clawbackOnThisVisit = input.linesSummary?.samePeriodServiceClawbackOnAdjustedBookings ?? 0;
    const visits = input.productCalc.adjustedVisits;
    const storedByBooking = input.linesSummary?.positiveCommissionByBooking;
    const serviceOnThisVisit =
      visits?.length && storedByBooking
        ? storedServiceCommissionKeepingEachVisit({
            storedByBooking,
            clawbackByBooking: input.linesSummary?.serviceClawbackByBooking,
            visits,
          })
        : keepStoredRate
          ? addMoney(
              addMoney(
                ledgerServiceCommissionExcludingRetail(replacedStored, keptRevenue, excludedRevenue),
                ledgerServiceCommissionExcludingRetail(clawbackOnThisVisit, keptRevenue, excludedRevenue),
              ),
              input.productCalc.adjustedOwnRateAddonCommission ?? 0,
            )
          : replacement;
    serviceCommission = addMoney(
      subtractMoney(input.linesSummary?.commission ?? 0, replacedStored),
      serviceOnThisVisit,
    );
  }
  const usesStoredServiceLine =
    linesActive &&
    (!useCalculatedService || keepPlainStored) &&
    serviceCommission !== 0 &&
    !(planTiers || usesThreshold);
  const clawbackOnAdjusted = keepPlainStored
    ? input.linesSummary?.samePeriodServiceClawbackOnAdjustedBookings ?? 0
    : 0;
  if (usesStoredServiceLine) {
    serviceCommission = addMoney(serviceCommission, subtractMoney(samePeriodRefund, clawbackOnAdjusted));
  }
  commissionAdjustments = subtractMoney(commissionAdjustments, samePeriodRefund);
  let commissionAmount = addMoney(addMoney(serviceCommission, productCommission), commissionAdjustments);
  const ratedReturn = planReturnCommission(plan, input.productCalc);
  const hourlyRate = input.ignoreBasePay
    ? 0
    : plan
    ? Number(plan.hourlyRate ?? 0)
    : Number(input.hourlyRateFallback ?? 0);
  const salaryMonthly = input.ignoreBasePay
    ? 0
    : plan?.payModel === "salary" && plan.baseMonthly != null
      ? Number(plan.baseMonthly)
      : plan
        ? 0
        : Number(input.salaryFallback ?? 0);

  const proratedSalary = input.ignoreBasePay
    ? 0
    : salaryMonthly > 0
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

  let hourlyAmount = multiplyMoney(hourlyRate, input.hoursWorked);
  let salaryAmount = proratedSalary;

  if (plan) {
    const usePlanProductRate = !planTiers && !usesThreshold && plan.productRate != null;
    const compLines: CompensationLine[] = computeCompensation(
      plan,
      {
        serviceRevenue:
          planTiers && input.productCalc.serviceTierRevenue != null
            ? input.productCalc.serviceTierRevenue
            : subtractMoney(
                input.productCalc.serviceRevenue,
                input.productCalc.serviceOverrideRevenue ?? 0,
              ),
        productRevenue:
          planTiers && input.productCalc.productTierRevenue != null
            ? input.productCalc.productTierRevenue
            : usesThreshold || usePlanProductRate
              ? subtractMoney(
                  input.productCalc.productRevenue,
                  input.productCalc.productOverrideRevenue ?? 0,
                )
              : input.productCalc.productRevenue,
        serviceCommissionFromLedger: planTiers
          ? undefined
          : linesActive && (serviceCommission !== 0 || commissionAdjustments !== 0)
            ? serviceCommission
            : undefined,
        productCommissionFromLedger: planTiers || usePlanProductRate ? undefined : productCommission,
        overrideCommission: planTiers
          ? addMoney(
              input.productCalc.serviceOverrideCommission ?? 0,
              input.productCalc.productOverrideCommission ?? 0,
            )
          : linesActive && !usesThreshold
            ? addMoney(
                input.productCalc.posServiceOverrideCommission ?? 0,
                usePlanProductRate ? input.productCalc.productOverrideCommission ?? 0 : 0,
              )
            : addMoney(
                input.productCalc.serviceOverrideCommission ?? 0,
                usesThreshold || usePlanProductRate
                  ? input.productCalc.productOverrideCommission ?? 0
                  : 0,
              ),
        returnCommission: ratedReturn,
        supplementalServiceRevenue:
          linesActive && !planTiers && !usesThreshold
            ? input.productCalc.posServiceTierRevenue ?? 0
            : 0,
        hoursWorked: input.hoursWorked,
      },
      proratedSalary,
    );
    commissionAmount = 0;
    hourlyAmount = 0;
    salaryAmount = 0;
    for (const line of compLines) {
      if (line.code === "hourly") hourlyAmount = addMoney(hourlyAmount, line.amount);
      else if (line.code === "salary" || line.code === "salary_guarantee") {
        salaryAmount = addMoney(salaryAmount, line.amount);
      } else commissionAmount = addMoney(commissionAmount, line.amount);
    }
    commissionAmount = addMoney(commissionAmount, commissionAdjustments);
  } else if (!linesActive) {
    commissionAmount = input.productCalc.totalCommission;
  } else {
    commissionAmount = addMoney(commissionAmount, ratedReturn);
    commissionAmount = addMoney(commissionAmount, input.productCalc.posServiceCommission ?? 0);
  }

  if (!plan && !input.commissionEnabled) {
    commissionAmount = 0;
  }
  commissionAmount = addMoney(commissionAmount, input.linesSummary?.cancellationFeeShare ?? 0);

  const tipsFromLines = addMoney(input.linesSummary?.tips ?? 0, tipAdjustments);
  const appointmentTips =
    (input.linesSummary?.tips ?? 0) !== 0 || tipAdjustments !== 0
      ? tipsFromLines
      : input.tipsFromPeriod;
  const tipsAmount = input.tipsEnabled ? addMoney(appointmentTips, input.posSaleTips ?? 0) : 0;

  const carryForwardBalance = Number(input.carryForwardBalance) || 0;
  const carryForwardIn = carryForwardBalance < 0 ? roundCurrency(Math.abs(carryForwardBalance)) : 0;

  const draft = buildPayRunItem(
    input.staffId,
    input.staffName,
    {
      commissionAmount: roundCurrency(commissionAmount),
      hourlyAmount: roundCurrency(hourlyAmount),
      salaryAmount: roundCurrency(salaryAmount),
      tipsAmount: roundCurrency(tipsAmount),
    },
    { carryForwardBalance },
  );

  return {
    ...draft,
    commissionClawback,
    carryForwardIn,
    includedAdjustments: commissionAdjustments,
  };
}
