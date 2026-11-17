import { multiplyMoney, subtractMoney, addMoney, percentOf, roundCurrency } from "@beautonomi/utils";

export type PayModel =
  | "commission_only"
  | "base_plus_commission"
  | "base_or_commission_higher"
  | "commission_above_threshold"
  | "hourly"
  | "hourly_plus_commission"
  | "salary"
  | "booth_renter";

export type CommissionTier = {
  minRevenue: number;
  commissionRate: number;
};

export type PayPlanSnapshot = {
  payModel: PayModel;
  baseMonthly?: number;
  hourlyRate?: number;
  serviceRate?: number;
  productRate?: number;
  tierMode?: "retroactive" | "marginal";
  serviceTiers?: CommissionTier[];
  productTiers?: CommissionTier[];
  thresholdAmount?: number;
};

export type PeriodTotals = {
  serviceRevenue: number;
  productRevenue: number;
  serviceCommissionFromLedger?: number;
  productCommissionFromLedger?: number;
  /** Commission already fixed by a service or product percentage. Added after the tier. */
  overrideCommission?: number;
  /** Product returned this period that was sold earlier. Added after the tier and the target. */
  returnCommission?: number;
  /** Service sales missing from a stored commission figure, such as a till service. */
  supplementalServiceRevenue?: number;
  hoursWorked?: number;
};

export type CompensationLine = {
  code: string;
  amount: number;
  description?: string;
};

function pickTierRate(
  revenue: number,
  baseRate: number,
  tiers: CommissionTier[] | undefined,
  mode: "retroactive" | "marginal",
): number {
  if (!tiers?.length) return baseRate;
  const sorted = [...tiers].sort((a, b) => b.minRevenue - a.minRevenue);
  if (mode === "retroactive") {
    const t = sorted.find((x) => revenue >= x.minRevenue);
    return t?.commissionRate ?? baseRate;
  }
  const t = sorted.find((x) => revenue >= x.minRevenue);
  return t?.commissionRate ?? baseRate;
}

/** One tier ladder for the period's combined service and product sales. */
function marginalTierCommission(
  serviceRevenue: number,
  productRevenue: number,
  serviceRate: number,
  productRate: number,
  tiers: CommissionTier[] | undefined,
): number {
  const revenue = addMoney(serviceRevenue, productRevenue);
  if (revenue <= 0) return 0;
  if (!tiers?.length) {
    return addMoney(percentOf(serviceRevenue, serviceRate), percentOf(productRevenue, productRate));
  }
  const sorted = [...tiers].sort((a, b) => a.minRevenue - b.minRevenue);
  const serviceShare = serviceRevenue / revenue;
  let total = 0;
  const firstMin = sorted[0].minRevenue;
  if (firstMin > 0) {
    const below = Math.min(revenue, firstMin);
    const serviceBelow = multiplyMoney(below, serviceShare);
    const productBelow = subtractMoney(below, serviceBelow);
    total = addMoney(percentOf(serviceBelow, serviceRate), percentOf(productBelow, productRate));
  }
  for (let i = 0; i < sorted.length; i++) {
    const bandStart = sorted[i].minRevenue;
    const bandEnd = sorted[i + 1]?.minRevenue ?? Number.POSITIVE_INFINITY;
    const inBand = Math.max(0, subtractMoney(Math.min(revenue, bandEnd), bandStart));
    if (inBand > 0) {
      total = addMoney(total, percentOf(inBand, sorted[i].commissionRate));
    }
  }
  return total;
}

/**
 * Pure gross compensation from plan + period totals (excludes statutory deductions).
 */
export function computeCompensation(
  plan: PayPlanSnapshot,
  totals: PeriodTotals,
  proratedSalary: number,
): CompensationLine[] {
  const lines: CompensationLine[] = [];

  if (plan.payModel === "booth_renter") {
    return lines;
  }

  const serviceRev = totals.serviceRevenue;
  const productRev = totals.productRevenue;
  const tierMode = plan.tierMode ?? "retroactive";
  const tiers = plan.serviceTiers?.length ? plan.serviceTiers : plan.productTiers;
  const tierBase = addMoney(serviceRev, productRev);
  const svcRate = pickTierRate(tierBase, plan.serviceRate ?? 0, tiers, tierMode);
  const prodRate = pickTierRate(
    tierBase,
    plan.productRate ?? plan.serviceRate ?? 0,
    tiers,
    tierMode,
  );

  let commission: number;
  if (tierMode === "marginal" && tiers?.length) {
    commission = marginalTierCommission(
      serviceRev,
      productRev,
      plan.serviceRate ?? 0,
      plan.productRate ?? plan.serviceRate ?? 0,
      tiers,
    );
  } else {
    commission = addMoney(
      totals.serviceCommissionFromLedger ?? percentOf(serviceRev, svcRate),
      totals.productCommissionFromLedger ?? percentOf(productRev, prodRate),
    );
  }

  if (plan.payModel === "commission_above_threshold" && plan.thresholdAmount != null) {
    const totalRev = addMoney(serviceRev, productRev);
    const excess = Math.max(0, subtractMoney(totalRev, plan.thresholdAmount));
    if (excess <= 0 || totalRev <= 0) {
      commission = totalRev <= 0 ? Math.min(0, commission) : 0;
    } else {
      const serviceExcess = multiplyMoney(excess, serviceRev / totalRev);
      const productExcess = subtractMoney(excess, serviceExcess);
      commission = addMoney(percentOf(serviceExcess, svcRate), percentOf(productExcess, prodRate));
    }
  }

  if (!(plan.payModel === "commission_above_threshold" && plan.thresholdAmount != null)) {
    commission = addMoney(
      commission,
      percentOf(totals.supplementalServiceRevenue ?? 0, plan.serviceRate ?? 0),
    );
  }
  commission = addMoney(commission, totals.overrideCommission ?? 0);
  commission = addMoney(commission, totals.returnCommission ?? 0);

  const hourly = multiplyMoney(plan.hourlyRate ?? 0, totals.hoursWorked ?? 0);
  const salary =
    plan.payModel === "salary" || plan.payModel === "base_plus_commission"
      ? proratedSalary
      : plan.payModel === "base_or_commission_higher"
        ? 0
        : 0;

  switch (plan.payModel) {
    case "commission_only":
    case "commission_above_threshold":
      if (commission !== 0) lines.push({ code: "commission", amount: roundCurrency(commission) });
      break;
    case "hourly":
      if (hourly > 0) lines.push({ code: "hourly", amount: roundCurrency(hourly) });
      break;
    case "hourly_plus_commission":
      if (hourly > 0) lines.push({ code: "hourly", amount: roundCurrency(hourly) });
      if (commission !== 0) lines.push({ code: "commission", amount: roundCurrency(commission) });
      break;
    case "salary":
      if (proratedSalary > 0) lines.push({ code: "salary", amount: roundCurrency(proratedSalary) });
      break;
    case "base_plus_commission":
      if (proratedSalary > 0) lines.push({ code: "salary", amount: roundCurrency(proratedSalary) });
      if (commission !== 0) lines.push({ code: "commission", amount: roundCurrency(commission) });
      break;
    case "base_or_commission_higher": {
      const base = proratedSalary;
      const clawback = Math.min(0, commission);
      const earned = Math.max(base, Math.max(0, commission));
      if (earned > 0) {
        lines.push({
          code: earned === base ? "salary_guarantee" : "commission",
          amount: roundCurrency(earned),
          description: earned === base ? "Guaranteed minimum (base)" : "Commission exceeded base",
        });
      }
      if (clawback < 0) lines.push({ code: "commission", amount: roundCurrency(clawback) });
      break;
    }
    default:
      break;
  }

  return lines;
}

/**
 * A later return comes off at this period's plan rate.
 * A service or product with its own percentage keeps the amount already calculated.
 */
export function planReturnCommission(
  plan: { serviceRate?: number; productRate?: number } | null,
  calc: {
    returnCommission?: number | null;
    returnBaseProductRevenue?: number | null;
    returnBaseProductCommission?: number | null;
    returnBaseServiceRevenue?: number | null;
    returnBaseServiceCommission?: number | null;
  },
): number {
  let amount = calc.returnCommission ?? 0;
  if (!plan) return roundCurrency(amount);
  if (plan.productRate != null) {
    amount = addMoney(
      subtractMoney(amount, calc.returnBaseProductCommission ?? 0),
      percentOf(calc.returnBaseProductRevenue ?? 0, plan.productRate),
    );
  }
  if (plan.serviceRate != null) {
    amount = addMoney(
      subtractMoney(amount, calc.returnBaseServiceCommission ?? 0),
      percentOf(calc.returnBaseServiceRevenue ?? 0, plan.serviceRate),
    );
  }
  return roundCurrency(amount);
}

export function sumCompensationLines(lines: CompensationLine[]): number {
  return lines.reduce((s, l) => addMoney(s, l.amount), 0);
}

type LiveCommissionCalc = {
  totalCommission: number;
  serviceCommission: number;
  productCommission: number;
  serviceRevenue: number;
  productRevenue: number;
  serviceOverrideCommission?: number;
  serviceOverrideRevenue?: number;
  productOverrideCommission?: number;
  productOverrideRevenue?: number;
  serviceTierRevenue?: number | null;
  productTierRevenue?: number | null;
  returnCommission?: number | null;
  returnBaseProductRevenue?: number | null;
  returnBaseProductCommission?: number | null;
  returnBaseServiceRevenue?: number | null;
  returnBaseServiceCommission?: number | null;
};

/**
 * Commission the pay plan would put on a payslip for these sales.
 * A salary or hourly plan pays no sales commission. A marginal tier is not replaced by one flat rate.
 * No plan keeps the calculated total.
 */
export function commissionPayableOnPlan(
  plan: PayPlanSnapshot | null,
  calc: LiveCommissionCalc,
): number {
  if (!plan) return roundCurrency(calc.totalCommission);
  const planTiers = Boolean(plan.serviceTiers?.length || plan.productTiers?.length);
  const usesThreshold =
    plan.payModel === "commission_above_threshold" && plan.thresholdAmount != null;
  const usePlanServiceRate = !planTiers && !usesThreshold && plan.serviceRate != null;
  const usePlanProductRate = !planTiers && !usesThreshold && plan.productRate != null;
  const lines = computeCompensation(
    plan,
    {
      serviceRevenue:
        planTiers && calc.serviceTierRevenue != null
          ? calc.serviceTierRevenue
          : subtractMoney(calc.serviceRevenue, calc.serviceOverrideRevenue ?? 0),
      productRevenue:
        planTiers && calc.productTierRevenue != null
          ? calc.productTierRevenue
          : usesThreshold || usePlanProductRate
            ? subtractMoney(calc.productRevenue, calc.productOverrideRevenue ?? 0)
            : calc.productRevenue,
      serviceCommissionFromLedger: planTiers || usePlanServiceRate ? undefined : calc.serviceCommission,
      productCommissionFromLedger: planTiers || usePlanProductRate ? undefined : calc.productCommission,
      overrideCommission: planTiers
        ? addMoney(calc.serviceOverrideCommission ?? 0, calc.productOverrideCommission ?? 0)
        : usesThreshold
          ? addMoney(calc.serviceOverrideCommission ?? 0, calc.productOverrideCommission ?? 0)
          : addMoney(
              usePlanServiceRate ? calc.serviceOverrideCommission ?? 0 : 0,
              usePlanProductRate ? calc.productOverrideCommission ?? 0 : 0,
            ),
      returnCommission: planReturnCommission(plan, calc),
      hoursWorked: 0,
    },
    0,
  );
  return roundCurrency(
    lines.reduce((sum, line) => (line.code === "commission" ? addMoney(sum, line.amount) : sum), 0),
  );
}

