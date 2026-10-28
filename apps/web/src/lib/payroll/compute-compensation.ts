import { percentOf } from "@beautonomi/utils";

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

function marginalTierCommission(
  revenue: number,
  baseRate: number,
  tiers: CommissionTier[] | undefined,
): number {
  if (revenue <= 0) return 0;
  if (!tiers?.length) return percentOf(revenue, baseRate);
  const sorted = [...tiers].sort((a, b) => a.minRevenue - b.minRevenue);
  if (revenue < sorted[0].minRevenue) {
    return percentOf(revenue, baseRate);
  }
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    const bandStart = tier.minRevenue;
    const bandEnd = sorted[i + 1]?.minRevenue ?? Number.POSITIVE_INFINITY;
    const inBand = Math.max(0, Math.min(revenue, bandEnd) - bandStart);
    if (inBand > 0) {
      total += percentOf(inBand, tier.commissionRate);
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
  const svcRate = pickTierRate(
    serviceRev + productRev,
    plan.serviceRate ?? 0,
    plan.serviceTiers,
    tierMode,
  );
  const prodRate = pickTierRate(
    productRev,
    plan.productRate ?? plan.serviceRate ?? 0,
    plan.productTiers,
    tierMode,
  );

  let commission: number;
  if (tierMode === "marginal" && (plan.serviceTiers?.length || plan.productTiers?.length)) {
    const svcPart =
      totals.serviceCommissionFromLedger ??
      marginalTierCommission(serviceRev, plan.serviceRate ?? 0, plan.serviceTiers);
    const prodPart =
      totals.productCommissionFromLedger ??
      marginalTierCommission(productRev, plan.productRate ?? plan.serviceRate ?? 0, plan.productTiers);
    commission = svcPart + prodPart;
  } else {
    commission =
      (totals.serviceCommissionFromLedger ?? percentOf(serviceRev, svcRate)) +
      (totals.productCommissionFromLedger ?? percentOf(productRev, prodRate));
  }

  if (plan.payModel === "commission_above_threshold" && plan.thresholdAmount != null) {
    const excess = Math.max(0, serviceRev + productRev - plan.thresholdAmount);
    commission = percentOf(excess, svcRate);
  }

  const hourly = (totals.hoursWorked ?? 0) * (plan.hourlyRate ?? 0);
  const salary =
    plan.payModel === "salary" || plan.payModel === "base_plus_commission"
      ? proratedSalary
      : plan.payModel === "base_or_commission_higher"
        ? 0
        : 0;

  switch (plan.payModel) {
    case "commission_only":
    case "commission_above_threshold":
      if (commission > 0) lines.push({ code: "commission", amount: round2(commission) });
      break;
    case "hourly":
      if (hourly > 0) lines.push({ code: "hourly", amount: round2(hourly) });
      break;
    case "hourly_plus_commission":
      if (hourly > 0) lines.push({ code: "hourly", amount: round2(hourly) });
      if (commission > 0) lines.push({ code: "commission", amount: round2(commission) });
      break;
    case "salary":
      if (proratedSalary > 0) lines.push({ code: "salary", amount: round2(proratedSalary) });
      break;
    case "base_plus_commission":
      if (proratedSalary > 0) lines.push({ code: "salary", amount: round2(proratedSalary) });
      if (commission > 0) lines.push({ code: "commission", amount: round2(commission) });
      break;
    case "base_or_commission_higher": {
      const base = proratedSalary;
      const chosen = Math.max(base, commission);
      if (chosen > 0) {
        lines.push({
          code: chosen === base ? "salary_guarantee" : "commission",
          amount: round2(chosen),
          description:
            chosen === base ? "Guaranteed minimum (base)" : "Commission exceeded base",
        });
      }
      break;
    }
    default:
      break;
  }

  return lines;
}

export function sumCompensationLines(lines: CompensationLine[]): number {
  return round2(lines.reduce((s, l) => s + l.amount, 0));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
