import type { FinanceLedgerAggregate } from "@/lib/admin/aggregate-finance-ledger-rows";
import {
  gatewayFeesTotalFromAggregate,
  platformRevenueNetFromAggregate,
} from "@/lib/admin/aggregate-finance-ledger-rows";

/** Completed bookings only for habit / frequency metrics. */
export type CompletedBookingLite = {
  customer_id: string;
  provider_id: string;
  scheduled_at: string;
  total_amount?: number | null;
};

export type MarketplaceHealthContracts = {
  bookingFrequency30d: number;
  repeatRate90d: number;
  transactingProviders7d: number;
  transactingProviders30d: number;
  activeProviders: number;
  supplyLiquidity: number;
  providerBookingsPerWeek: number;
  takeRate: number;
  contributionMargin: number;
  gmv: number;
  platformNet: number;
};

export function computeTakeRate(agg: FinanceLedgerAggregate): number {
  const gmv = agg.service_collected_gross;
  if (gmv <= 0) return 0;
  const take = agg.platform_take_net + agg.service_fee_revenue;
  return take / gmv;
}

export function computeContributionMargin(agg: FinanceLedgerAggregate): number {
  const platformNet = platformRevenueNetFromAggregate(agg);
  const gateway = gatewayFeesTotalFromAggregate(agg);
  const refundImpact = agg.platform_refund_impact ?? agg.platform_refund_contra ?? 0;
  return platformNet - gateway - Math.abs(refundImpact);
}

/**
 * Booking frequency: completed bookings in window / distinct customers with ≥1 completed in window.
 */
export function computeBookingFrequency(
  bookings: CompletedBookingLite[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const inWindow = bookings.filter((b) => {
    const t = new Date(b.scheduled_at).getTime();
    return t >= windowStart.getTime() && t <= windowEnd.getTime();
  });
  const customers = new Set(inWindow.map((b) => b.customer_id).filter(Boolean));
  if (customers.size === 0) return 0;
  return inWindow.length / customers.size;
}

/**
 * Repeat rate: customers with 2+ completed in window / customers with 1+ in window.
 */
export function computeRepeatRate(
  bookings: CompletedBookingLite[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    const t = new Date(b.scheduled_at).getTime();
    if (t < windowStart.getTime() || t > windowEnd.getTime()) continue;
    if (!b.customer_id) continue;
    counts.set(b.customer_id, (counts.get(b.customer_id) ?? 0) + 1);
  }
  const withOne = [...counts.values()].filter((c) => c >= 1).length;
  if (withOne === 0) return 0;
  const withTwo = [...counts.values()].filter((c) => c >= 2).length;
  return withTwo / withOne;
}

export function medianDaysBetweenVisits(bookings: CompletedBookingLite[]): number | null {
  const byCustomer = new Map<string, number[]>();
  for (const b of bookings) {
    if (!b.customer_id) continue;
    const t = new Date(b.scheduled_at).getTime();
    if (!Number.isFinite(t)) continue;
    const arr = byCustomer.get(b.customer_id) ?? [];
    arr.push(t);
    byCustomer.set(b.customer_id, arr);
  }
  const gaps: number[] = [];
  for (const times of byCustomer.values()) {
    if (times.length < 2) continue;
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      gaps.push((times[i]! - times[i - 1]!) / (24 * 60 * 60 * 1000));
    }
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1]! + gaps[mid]!) / 2 : gaps[mid]!;
}

export function countTransactingProviders(
  bookings: CompletedBookingLite[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const ids = new Set<string>();
  for (const b of bookings) {
    const t = new Date(b.scheduled_at).getTime();
    if (t < windowStart.getTime() || t > windowEnd.getTime()) continue;
    if (b.provider_id) ids.add(b.provider_id);
  }
  return ids.size;
}

export function computeProviderBookingsPerWeek(
  bookings: CompletedBookingLite[],
  windowStart: Date,
  windowEnd: Date,
): number {
  const transacting = countTransactingProviders(bookings, windowStart, windowEnd);
  if (transacting === 0) return 0;
  const inWindow = bookings.filter((b) => {
    const t = new Date(b.scheduled_at).getTime();
    return t >= windowStart.getTime() && t <= windowEnd.getTime();
  });
  const days = Math.max(1, (windowEnd.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000));
  const weeks = days / 7;
  return inWindow.length / transacting / weeks;
}

export function computeSupplyLiquidity(transacting30d: number, activeProviders: number): number {
  if (activeProviders <= 0) return 0;
  return transacting30d / activeProviders;
}

export type CohortRetentionRow = {
  cohortMonth: string;
  cohortSize: number;
  m1: number | null;
  m3: number | null;
  m6: number | null;
};

/**
 * First completed booking month = cohort. Retention = share with another completed in M+1, M+3, M+6.
 */
export function computeCohortRetention(bookings: CompletedBookingLite[]): CohortRetentionRow[] {
  const byCustomer = new Map<string, number[]>();
  for (const b of bookings) {
    if (!b.customer_id) continue;
    const t = new Date(b.scheduled_at).getTime();
    if (!Number.isFinite(t)) continue;
    const arr = byCustomer.get(b.customer_id) ?? [];
    arr.push(t);
    byCustomer.set(b.customer_id, arr);
  }

  const cohortMonth = new Map<string, string>();
  for (const [cid, times] of byCustomer) {
    const first = Math.min(...times);
    const d = new Date(first);
    cohortMonth.set(cid, `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const cohorts = new Map<string, string[]>();
  for (const [cid, month] of cohortMonth) {
    const list = cohorts.get(month) ?? [];
    list.push(cid);
    cohorts.set(month, list);
  }

  const rows: CohortRetentionRow[] = [];
  for (const [month, customerIds] of [...cohorts.entries()].sort()) {
    const size = customerIds.length;
    if (size === 0) continue;
    const [y, m] = month.split("-").map(Number);
    const cohortStart = Date.UTC(y!, m! - 1, 1);

    const rateAtOffset = (offsetMonths: number): number | null => {
      const windowStart = new Date(cohortStart);
      windowStart.setUTCMonth(windowStart.getUTCMonth() + offsetMonths);
      const windowEnd = new Date(windowStart);
      windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 1);
      let retained = 0;
      for (const cid of customerIds) {
        const times = byCustomer.get(cid) ?? [];
        const hasReturn = times.some((t) => {
          const d = new Date(t);
          return d.getTime() >= windowStart.getTime() && d.getTime() < windowEnd.getTime();
        });
        if (hasReturn) retained++;
      }
      return retained / size;
    };

    rows.push({
      cohortMonth: month,
      cohortSize: size,
      m1: rateAtOffset(1),
      m3: rateAtOffset(3),
      m6: rateAtOffset(6),
    });
  }
  return rows;
}

export type MrrBridge = {
  starting_mrr: number;
  new_mrr: number;
  expansion_mrr: number;
  contraction_mrr: number;
  churned_mrr: number;
  ending_mrr: number;
  grr: number;
  nrr: number;
  revenue_churn_rate: number;
  quick_ratio: number;
};

export function computeMrrBridge(params: {
  startingMrr: number;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnedMrr: number;
}): MrrBridge {
  const { startingMrr, newMrr, expansionMrr, contractionMrr, churnedMrr } = params;
  const endingMrr = startingMrr + newMrr + expansionMrr - contractionMrr - churnedMrr;
  const denom = startingMrr > 0 ? startingMrr : 0;
  const grr =
    denom > 0
      ? Math.min(100, ((startingMrr - contractionMrr - churnedMrr) / denom) * 100)
      : 0;
  const nrr = denom > 0 ? ((startingMrr + expansionMrr - contractionMrr - churnedMrr) / denom) * 100 : 0;
  const revenueChurn = denom > 0 ? (churnedMrr / denom) * 100 : 0;
  const lost = contractionMrr + churnedMrr;
  const quick_ratio = lost > 0 ? (newMrr + expansionMrr) / lost : newMrr + expansionMrr > 0 ? 999 : 0;

  return {
    starting_mrr: startingMrr,
    new_mrr: newMrr,
    expansion_mrr: expansionMrr,
    contraction_mrr: contractionMrr,
    churned_mrr: churnedMrr,
    ending_mrr: endingMrr,
    grr: Math.round(grr * 100) / 100,
    nrr: Math.round(nrr * 100) / 100,
    revenue_churn_rate: Math.round(revenueChurn * 100) / 100,
    quick_ratio: Math.round(quick_ratio * 100) / 100,
  };
}

export function subscriptionMrrForPlan(
  priceMonthly: number | null | undefined,
  priceYearly: number | null | undefined,
  billingPeriod: string | null | undefined,
): number {
  const isMonthly = billingPeriod === "monthly";
  const price = isMonthly ? priceMonthly : priceYearly;
  if (!price || Number(price) <= 0) return 0;
  return isMonthly ? Number(price) : Number(price) / 12;
}

export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000));
}
