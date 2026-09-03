/**
 * Canonical provider revenue semantics — the single source of truth for "what the
 * provider earned" across every provider-facing surface (dashboard cards, business
 * overview, payment summary, finance, transactions feed, sales history).
 *
 * Background (verified against the ledger writers):
 * - `provider_earnings` rows carry the provider's post-commission service take and
 *   EXCLUDE tip / travel / cancellation (those post as their own rows). See
 *   `apps/web/src/app/api/public/bookings/_helpers/process-payment.ts` (~L935) and the
 *   Paystack webhook handler `_handlers/charge-success.ts`. They also carry the
 *   provider take from additional charges and product / membership earnings.
 * - `tip`, `travel_fee`, `cancellation_fee`, `walk_in_additional_charge` each post as a
 *   separate row with `amount === net`. Summing each type's `net` therefore counts every
 *   economic event exactly once with no double-count.
 * - `additional_charge_payment` carries `net = platformCommission` (the platform's leg,
 *   not provider money) and `additional_charge` is a `payment_transactions` gross row —
 *   both are excluded here.
 * - Refunds post EITHER as per-component `refund` rows (modern; migrations 652/654) OR a
 *   legacy negative `provider_earnings` reversal — never both for the same refund. So we
 *   net negative `provider_earnings` into recognized revenue AND subtract provider-money
 *   `refund` components without double-counting. See `@/lib/ledger/refund-components`.
 *
 * All functions are pure (no I/O) so they can be unit-tested and reused everywhere.
 */

import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";

/** Minimal `finance_transactions` row shape needed for provider revenue math. */
export interface ProviderRevenueLedgerRow {
  transaction_type: string;
  amount?: number | null;
  net?: number | null;
  refund_component?: string | null;
}

/**
 * Ledger `transaction_type`s that make up recognized provider revenue. Mutually
 * exclusive economic events (no type is embedded inside another), so summing their
 * `net` counts each exactly once.
 */
export const RECOGNIZED_REVENUE_TYPES = [
  "provider_earnings",
  "membership_provider_earnings",
  "tip",
  "travel_fee",
  "cancellation_fee",
  "walk_in_additional_charge",
] as const;

const RECOGNIZED_REVENUE_TYPE_SET: ReadonlySet<string> = new Set(RECOGNIZED_REVENUE_TYPES);

/** Provider take-home for a recognized-revenue row. `net` (== `amount` for these types). */
export function recognizedRowNet(row: ProviderRevenueLedgerRow): number {
  return Number(row.net ?? row.amount ?? 0);
}

/** @deprecated alias */
function rowNet(row: ProviderRevenueLedgerRow): number {
  return recognizedRowNet(row);
}

export type RecognizedRevenueInRangeRow = ProviderRevenueLedgerRow & {
  created_at?: string | null;
};

export type RecognizedRevenueInRangeOptions = {
  start?: Date;
  end?: Date;
};

/**
 * Sum of recognized provider revenue, GROSS of refunds. Legacy negative
 * `provider_earnings` reversals naturally reduce the total.
 */
export function recognizedRevenue(rows: ReadonlyArray<ProviderRevenueLedgerRow>): number {
  let sum = 0;
  for (const r of rows) {
    if (RECOGNIZED_REVENUE_TYPE_SET.has(r.transaction_type)) sum += rowNet(r);
  }
  return sum;
}

/**
 * Sum recognized provider revenue for ledger rows whose `created_at` falls in
 * `[start, end]` (inclusive). Rows without `created_at` are skipped when a
 * bound is set.
 */
export function recognizedRevenueInRange(
  rows: ReadonlyArray<RecognizedRevenueInRangeRow>,
  options?: RecognizedRevenueInRangeOptions,
): number {
  const { start, end } = options ?? {};
  let sum = 0;
  for (const r of rows) {
    if (!RECOGNIZED_REVENUE_TYPE_SET.has(r.transaction_type)) continue;
    if (start != null || end != null) {
      const createdAt = r.created_at ? new Date(r.created_at) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
      if (start != null && createdAt < start) continue;
      if (end != null && createdAt > end) continue;
    }
    sum += recognizedRowNet(r);
  }
  return sum;
}

/** Filter ledger rows by inclusive `created_at` bounds (rows without a valid timestamp are excluded when bounded). */
export function filterRowsByCreatedAtRange(
  rows: ReadonlyArray<RecognizedRevenueInRangeRow>,
  options?: RecognizedRevenueInRangeOptions,
): RecognizedRevenueInRangeRow[] {
  const { start, end } = options ?? {};
  if (start == null && end == null) return [...rows];
  return rows.filter((r) => {
    const createdAt = r.created_at ? new Date(r.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    if (start != null && createdAt < start) return false;
    if (end != null && createdAt > end) return false;
    return true;
  });
}

/** Provider service earnings only (`provider_earnings` net, incl. legacy reversals). */
export function providerServiceEarnings(rows: ReadonlyArray<ProviderRevenueLedgerRow>): number {
  let sum = 0;
  for (const r of rows) {
    if (r.transaction_type === "provider_earnings") sum += rowNet(r);
  }
  return sum;
}

/**
 * The provider's own refund clawback as a POSITIVE number. Only refund components that
 * were actually the provider's money count (platform fee/commission, tax, discount
 * contras and wallet/gift tender legs are excluded; see refund-components).
 */
export function providerRefundDeduction(rows: ReadonlyArray<ProviderRevenueLedgerRow>): number {
  let sum = 0;
  for (const r of rows) {
    if (r.transaction_type === "refund" && isProviderEarningsRefundComponent(r.refund_component)) {
      sum += Math.abs(rowNet(r));
    }
  }
  return sum;
}

/** Recognized provider revenue NET of the provider's refund clawbacks. */
export function providerNetAfterRefunds(rows: ReadonlyArray<ProviderRevenueLedgerRow>): number {
  return recognizedRevenue(rows) - providerRefundDeduction(rows);
}

/** Itemized recognized-revenue breakdown that always reconciles to the totals above. */
export interface ProviderRevenueBreakdown {
  serviceEarnings: number;
  membershipEarnings: number;
  tips: number;
  travelFees: number;
  cancellationFees: number;
  walkInAdditionalCharges: number;
  /** Sum of the six components above (== recognizedRevenue). */
  recognizedRevenue: number;
  /** Positive provider refund clawback. */
  refundDeduction: number;
  /** recognizedRevenue - refundDeduction. */
  netAfterRefunds: number;
}

/** Compute the full recognized-revenue breakdown in a single pass over the ledger rows. */
export function computeProviderRevenueBreakdown(
  rows: ReadonlyArray<ProviderRevenueLedgerRow>,
): ProviderRevenueBreakdown {
  let serviceEarnings = 0;
  let membershipEarnings = 0;
  let tips = 0;
  let travelFees = 0;
  let cancellationFees = 0;
  let walkInAdditionalCharges = 0;
  let refundDeduction = 0;

  for (const r of rows) {
    switch (r.transaction_type) {
      case "provider_earnings":
        serviceEarnings += rowNet(r);
        break;
      case "membership_provider_earnings":
        membershipEarnings += rowNet(r);
        break;
      case "tip":
        tips += rowNet(r);
        break;
      case "travel_fee":
        travelFees += rowNet(r);
        break;
      case "cancellation_fee":
        cancellationFees += rowNet(r);
        break;
      case "walk_in_additional_charge":
        walkInAdditionalCharges += rowNet(r);
        break;
      case "refund":
        if (isProviderEarningsRefundComponent(r.refund_component)) {
          refundDeduction += Math.abs(rowNet(r));
        }
        break;
      default:
        break;
    }
  }

  const recognized =
    serviceEarnings + membershipEarnings + tips + travelFees + cancellationFees + walkInAdditionalCharges;
  return {
    serviceEarnings,
    membershipEarnings,
    tips,
    travelFees,
    cancellationFees,
    walkInAdditionalCharges,
    recognizedRevenue: recognized,
    refundDeduction,
    netAfterRefunds: recognized - refundDeduction,
  };
}

/** Ledger row shape for dashboard earnings-mix (non-overlapping UI lines). */
export type DashboardEarningsMixRow = ProviderRevenueLedgerRow & {
  booking_id?: string | null;
  product_order_id?: string | null;
  description?: string | null;
};

export function isPlatformAdditionalChargeProviderEarnings(row: DashboardEarningsMixRow): boolean {
  return (
    row.transaction_type === "provider_earnings" &&
    String(row.description ?? "").toLowerCase().includes("additional charge")
  );
}

/**
 * Split `provider_earnings` so dashboard "Services" and "Additional charges" do not
 * double-count. Includes platform-settled add-ons (provider_earnings) and walk-in
 * add-ons (`walk_in_additional_charge`).
 */
export function isMembershipProviderEarningsRow(row: DashboardEarningsMixRow): boolean {
  return row.transaction_type === "membership_provider_earnings";
}

export function isMembershipProviderEarnings(row: DashboardEarningsMixRow): boolean {
  return (
    isMembershipProviderEarningsRow(row) ||
    (row.transaction_type === "provider_earnings" &&
      !row.booking_id &&
      !row.product_order_id)
  );
}

export function computeDashboardEarningsMix(rows: ReadonlyArray<DashboardEarningsMixRow>) {
  let platformAdditionalChargeEarnings = 0;
  let walkInAdditionalChargeEarnings = 0;
  let bookingEarningsTotal = 0;
  let productOrderEarningsTotal = 0;
  let membershipEarningsTotal = 0;
  let otherEarningsTotal = 0;

  for (const r of rows) {
    const net = recognizedRowNet(r);
    if (r.transaction_type === "walk_in_additional_charge") {
      walkInAdditionalChargeEarnings += net;
      continue;
    }
    if (r.transaction_type !== "provider_earnings" && r.transaction_type !== "membership_provider_earnings") continue;
    if (r.product_order_id) {
      productOrderEarningsTotal += net;
      continue;
    }
    if (r.booking_id) {
      bookingEarningsTotal += net;
      if (isPlatformAdditionalChargeProviderEarnings(r)) {
        platformAdditionalChargeEarnings += net;
      }
      continue;
    }
    if (isMembershipProviderEarnings(r)) {
      membershipEarningsTotal += net;
      continue;
    }
    if (r.transaction_type === "provider_earnings") {
      otherEarningsTotal += net;
    }
  }

  const additionalChargeEarningsTotal =
    platformAdditionalChargeEarnings + walkInAdditionalChargeEarnings;

  return {
    serviceEarningsTotal: bookingEarningsTotal - platformAdditionalChargeEarnings,
    bookingEarningsTotal,
    productOrderEarningsTotal,
    membershipEarningsTotal,
    additionalChargeEarningsTotal,
    platformAdditionalChargeEarnings,
    walkInAdditionalChargeEarnings,
    otherEarningsTotal,
  };
}
