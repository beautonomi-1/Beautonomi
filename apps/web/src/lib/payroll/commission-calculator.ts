import type { SupabaseClient } from "@supabase/supabase-js";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { STAFF_COMMISSION_REVENUE_TYPES } from "@/lib/reports/constants";
import { subtractMoney, multiplyMoney, addMoney, percentOf, sumMoney, toMinorUnits, fromMinorUnits } from "@beautonomi/utils";
import { isBookingCollectionSale } from "@/lib/reports/provider-sales-history";
import { parseTipFromSaleNotes } from "@/lib/receipts/build-sale-receipt";
import { resolveStaffRates } from "./resolve-staff-rates";

/**
 * Retail added to an appointment. Nothing is commissioned before the appointment is paid.
 * A discount reduces the product, and a deposit pays only that product's share of what was received.
 */
export function paidAppointmentLineShares(input: {
  lines: ReadonlyArray<{ id: string; price: number }>;
  bookingPaidAmount: number;
  bill?: { subtotal: number; discounts: number };
}): Map<string, number> {
  const out = new Map<string, number>();
  if (input.bookingPaidAmount <= 0) return out;
  const priced = input.lines.filter((line) => line.id && line.price > 0);
  if (priced.length === 0) return out;
  const subtotal = input.bill?.subtotal ?? 0;
  if (subtotal <= 0) {
    for (const line of priced) out.set(line.id, line.price);
    return out;
  }
  const net = Math.max(0, subtractMoney(subtotal, Math.max(0, input.bill?.discounts ?? 0)));
  if (net <= 0) return out;
  const payable = Math.min(input.bookingPaidAmount, net);
  const known = priced.reduce((sum, line) => addMoney(sum, line.price), 0);
  const rest = subtractMoney(subtotal, known);
  const parts = [
    ...priced.map((line) => ({ id: line.id, weight: line.price })),
    ...(rest > 0 ? [{ id: "__rest", weight: rest }] : []),
  ];
  for (const line of priced) {
    const share = pooledShare({ amount: payable, parts, id: line.id });
    if (share > 0) out.set(line.id, share);
  }
  return out;
}

export function paidAppointmentProductAmount(
  productPrice: number,
  bookingPaidAmount: number,
  bill?: { subtotal: number; discounts: number },
): number {
  if (productPrice <= 0 || bookingPaidAmount <= 0) return 0;
  return (
    paidAppointmentLineShares({
      lines: [{ id: "line", price: productPrice }],
      bookingPaidAmount,
      bill,
    }).get("line") ?? 0
  );
}

/**
 * A paid visit earns service and product commission.
 * A cancellation or no-show does not. That fee is shared only when the salon turns the fee share on.
 */
export const COMMISSION_BOOKING_STATUSES = [
  "confirmed",
  "checked_in",
  "waiting",
  "in_progress",
  "completed",
] as const;

export function bookingEarnsCommission(status: string | null | undefined): boolean {
  return (COMMISSION_BOOKING_STATUSES as readonly string[]).includes(String(status ?? ""));
}

/** Bookings that took money in this pay period. Commission follows the payment, not the appointment date. */
export function paidBookingIds(revenueByBooking: Map<string, number>): string[] {
  const ids: string[] = [];
  for (const [id, amount] of revenueByBooking) {
    if (id && amount > 0) ids.push(id);
  }
  return ids;
}

export type AppointmentCommissionRefund = {
  booking_id?: string | null;
  amount?: number | string | null;
  net?: number | string | null;
  refund_component?: string | null;
};

/**
 * A provider-earnings refund reduces what the stylist is commissioned on.
 * A tip, fee, or tax refund does not. A blank or legacy component is the old single refund row.
 */
export function refundReducesAppointmentCommission(component: string | null | undefined): boolean {
  if (component == null || component === "" || component === "_legacy") return true;
  return component === "provider_earnings";
}

/**
 * Take a same-period refund off the money collected for that appointment.
 * A refund larger than this period's earnings is left alone: that visit was paid in an earlier
 * period, and the clawback line (not this base) is what reduces the later payslip.
 */
export function netBookingRevenueAfterRefunds(
  revenueByBooking: Map<string, number>,
  refunds: readonly AppointmentCommissionRefund[],
): { revenueByBooking: Map<string, number>; bookingsReduced: string[] } {
  const refundByBooking = new Map<string, number>();
  for (const refund of refunds) {
    const bookingId = refund.booking_id?.trim() ?? "";
    if (!bookingId || !refundReducesAppointmentCommission(refund.refund_component)) continue;
    const amount = Math.abs(Number(refund.net ?? refund.amount) || 0);
    if (amount <= 0) continue;
    refundByBooking.set(bookingId, addMoney(refundByBooking.get(bookingId) ?? 0, amount));
  }

  const next = new Map(revenueByBooking);
  const bookingsReduced: string[] = [];
  for (const [bookingId, refundAmount] of refundByBooking) {
    const collected = next.get(bookingId) ?? 0;
    if (collected <= 0 || refundAmount > collected + 0.009) continue;
    next.set(bookingId, Math.max(0, subtractMoney(collected, refundAmount)));
    bookingsReduced.push(bookingId);
  }
  return { revenueByBooking: next, bookingsReduced };
}

function appointmentRetailBill(booking: {
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  promotion_discount_amount?: number | string | null;
  membership_discount_amount?: number | string | null;
  loyalty_discount_amount?: number | string | null;
} | null | undefined): { subtotal: number; discounts: number } | undefined {
  if (!booking) return undefined;
  const discounts = [
    booking.discount_amount,
    booking.promotion_discount_amount,
    booking.membership_discount_amount,
    booking.loyalty_discount_amount,
  ].reduce<number>((sum, value) => addMoney(sum, Number(value) || 0), 0);
  return { subtotal: Number(booking.subtotal) || 0, discounts };
}

/** One product line. A product with commission off is left out. Its own percentage is not put on the tier. */
export function splitProductCommissionLine(input: {
  amount: number;
  commissionEnabled: boolean;
  staffCommissionEnabled: boolean;
  overrideRate: number | null;
  baseRate: number;
}): { revenue: number; tierRevenue: number; overrideCommission: number; commission: number } {
  if (!input.commissionEnabled || input.amount <= 0) {
    return { revenue: 0, tierRevenue: 0, overrideCommission: 0, commission: 0 };
  }
  const rate = input.overrideRate != null ? input.overrideRate : input.baseRate;
  const commission = percentOf(input.amount, input.staffCommissionEnabled ? rate : 0);
  if (input.overrideRate != null) {
    return { revenue: input.amount, tierRevenue: 0, overrideCommission: commission, commission };
  }
  return { revenue: input.amount, tierRevenue: input.amount, overrideCommission: 0, commission };
}

/** Sales that can earn commission. A service with commission turned off is left out of the tier base. */
export function commissionableServiceRevenue(input: {
  bookingRevenue: number;
  totalServicePrice: number;
  staffServices: { price: number; commissionEnabled: boolean }[];
}): number {
  if (input.bookingRevenue <= 0 || input.totalServicePrice <= 0) return 0;
  let commissionablePrice = 0;
  for (const svc of input.staffServices) {
    if (!svc.commissionEnabled) continue;
    commissionablePrice = addMoney(commissionablePrice, Number(svc.price) || 0);
  }
  if (commissionablePrice <= 0) return 0;
  return multiplyMoney(input.bookingRevenue, commissionablePrice / input.totalServicePrice);
}

/** Service pay is the collected amount minus retail on the same appointment, so a product is not commissioned twice. */
export function serviceRevenueAfterRetail(bookingRevenue: number, retailOnBill: number): number {
  if (bookingRevenue <= 0) return 0;
  const retail = Math.max(0, Number(retailOnBill) || 0);
  if (retail <= 0) return bookingRevenue;
  return Math.max(0, subtractMoney(bookingRevenue, retail));
}

/**
 * Commission stored at payment is a percentage of the whole appointment, including retail.
 * Keep the service share. The product is commissioned on its own line.
 */
export function ledgerServiceCommissionExcludingRetail(
  ledgerCommission: number,
  serviceRevenue: number,
  appointmentProductRevenue: number,
): number {
  if (ledgerCommission === 0 || appointmentProductRevenue <= 0) return ledgerCommission;
  const base = addMoney(Math.max(0, serviceRevenue), appointmentProductRevenue);
  if (base <= 0) return ledgerCommission;
  return multiplyMoney(ledgerCommission, Math.max(0, serviceRevenue) / base);
}

export type AdjustedVisitRetail = {
  bookingId: string;
  keptRevenue: number;
  excludedRevenue: number;
  ownRateAddonCommission: number;
  /** An add-on paid at the service rate saved for this visit. */
  serviceRateAddonPay?: number;
  /** Used when nothing was saved for this visit, such as a complimentary service with an add-on. */
  calculatedCommission?: number;
};

/** Each visit keeps the rate saved when that client paid. A later visit does not change it. */
export function storedServiceCommissionKeepingEachVisit(input: {
  storedByBooking: Readonly<Record<string, number>>;
  clawbackByBooking?: Readonly<Record<string, number>>;
  visits: readonly AdjustedVisitRetail[];
}): number {
  let total = 0;
  for (const visit of input.visits) {
    const kept = visit.keptRevenue;
    const excluded = visit.excludedRevenue;
    const stored = input.storedByBooking[visit.bookingId] ?? 0;
    const clawback = input.clawbackByBooking?.[visit.bookingId] ?? 0;
    if (stored === 0 && clawback === 0) {
      total = addMoney(total, visit.calculatedCommission ?? 0);
      continue;
    }
    const base = addMoney(Math.max(0, kept), Math.max(0, excluded));
    const addonPay = visit.serviceRateAddonPay ?? 0;
    total = addMoney(total, ledgerServiceCommissionExcludingRetail(stored, kept, excluded));
    total = addMoney(total, ledgerServiceCommissionExcludingRetail(clawback, kept, excluded));
    if (base > 0 && addonPay > 0) {
      total = addMoney(total, multiplyMoney(addonPay, stored / base));
      total = addMoney(total, multiplyMoney(addonPay, clawback / base));
    }
    total = addMoney(total, visit.ownRateAddonCommission);
  }
  return total;
}

export interface CommissionResult {
  serviceCommission: number;
  productCommission: number;
  totalCommission: number;
  serviceRevenue: number;
  productRevenue: number;
  totalRevenue: number;
  totalBookings: number; // Bookings where staff had services
  /** Commission from a service or product that has its own percentage. Not part of the tier. */
  serviceOverrideCommission: number;
  /** Sales paid at a service's own percentage. Kept out of the flat plan rate. */
  serviceOverrideRevenue: number;
  /** Product sales paid at the product's own percentage. Kept out of the sales target. */
  productOverrideRevenue: number;
  /** Till services with no percentage of their own. Added when appointment lines replace the calculator. */
  posServiceTierRevenue: number;
  posServiceOverrideCommission: number;
  posServiceCommission: number;
  productOverrideCommission: number;
  /** Sales that use the pay-plan tier. Excludes a service or product with its own percentage. */
  serviceTierRevenue: number;
  productTierRevenue: number;
  /** A product returned in this period that was sold earlier. Not part of this period's tier. */
  returnCommission: number;
  /** Returned product sales that use the plan product rate, not a product's own percentage. */
  returnBaseProductRevenue?: number;
  returnBaseProductCommission?: number;
  /** Returned till services that use the plan service rate, not a service's own percentage. */
  returnBaseServiceRevenue?: number;
  returnBaseServiceCommission?: number;
  /** Retail on appointments. Already inside provider earnings, so it must not also sit in the service commission line. */
  appointmentProductRevenue: number;
  /** This person's service commission was calculated after retail was taken off the appointment. */
  serviceExcludesAppointmentRetail: boolean;
  /** An add-on was taken out of the service amount and commissioned on its own rate. */
  serviceExcludesAddons: boolean;
  /**
   * Appointments whose stored service commission includes a product or add-on.
   * Only those visits are recalculated. Other visits in the week keep the amount saved at payment.
   */
  serviceAdjustedBookingIds: string[];
  /** Service commission for those appointments, after the product or add-on was taken out. */
  serviceCommissionOnAdjustedBookings: number;
  /** Service sales, including an add-on with no percentage of its own, on those appointments. */
  adjustedServiceKeptRevenue: number;
  /** Product sales and add-ons with their own percentage. Taken out of the saved service commission. */
  adjustedServiceExcludedRevenue: number;
  /** An add-on's own percentage on those appointments. */
  adjustedOwnRateAddonCommission: number;
  /** Product sales on an appointment this person serviced. Only that amount sits inside the saved service commission. */
  appointmentProductRevenueOnServicedBookings: number;
  /** One row per visit that included a product or add-on, so each keeps its own saved rate. */
  adjustedVisits: AdjustedVisitRetail[];
  /**
   * Appointments whose same-period refund was taken off the commission base.
   * The matching clawback line must not be deducted again.
   */
  refundsNettedBookingIds: string[];
}

export type AddonServiceLine = {
  offeringId: string;
  staffId: string | null;
  price: number;
  /** Catalogue id. An add-on can be scoped to this instead of the booking offering id. */
  masterServiceId?: string | null;
};

/**
 * A till line after the sale discount and any amount already returned.
 * What the client kept is still commissioned.
 */
export function saleLineKeptAmounts(input: {
  lines: ReadonlyArray<{ id: string; lineTotal: number }>;
  subtotal: number;
  discountAmount?: number | null;
  totalAmount?: number | null;
  refundedAmount?: number | null;
}): Map<string, number> {
  const out = new Map<string, number>();
  const priced = input.lines.filter((line) => line.id && line.lineTotal > 0);
  if (priced.length === 0) return out;
  const subtotal = Math.max(0, Number(input.subtotal) || 0);
  const discount = Math.max(0, Number(input.discountAmount) || 0);
  const net = subtotal > 0 ? Math.max(0, subtractMoney(subtotal, discount)) : 0;
  const merchandise = subtotal > 0 ? net : priced.reduce((sum, line) => addMoney(sum, line.lineTotal), 0);
  const paid = Math.max(0, Number(input.totalAmount) || net || merchandise);
  const refunded = Math.min(paid, Math.max(0, Number(input.refundedAmount) || 0));
  if (paid <= 0 || merchandise <= 0) return out;
  const pool = multiplyMoney(merchandise, Math.max(0, subtractMoney(paid, refunded)) / paid);
  if (pool <= 0) return out;
  const known = priced.reduce((sum, line) => addMoney(sum, line.lineTotal), 0);
  const rest = subtotal > 0 ? subtractMoney(subtotal, known) : 0;
  const parts = [
    ...priced.map((line) => ({ id: line.id, weight: line.lineTotal })),
    ...(rest > 0 ? [{ id: "__rest", weight: rest }] : []),
  ];
  for (const line of priced) {
    const share = pooledShare({ amount: pool, parts, id: line.id });
    if (share > 0) out.set(line.id, share);
  }
  return out;
}

export function walkInRealizedLineAmount(input: {
  lineTotal: number;
  subtotal: number;
  discountAmount?: number | null;
  totalAmount?: number | null;
  refundedAmount?: number | null;
}): number {
  const lineTotal = Math.max(0, Number(input.lineTotal) || 0);
  if (lineTotal <= 0) return 0;
  return (
    saleLineKeptAmounts({
      lines: [{ id: "line", lineTotal }],
      subtotal: input.subtotal,
      discountAmount: input.discountAmount,
      totalAmount: input.totalAmount,
      refundedAmount: input.refundedAmount,
    }).get("line") ?? 0
  );
}

export function saleLinesInPeriod(input: {
  lines: ReadonlyArray<{ id: string; lineTotal: number }>;
  subtotal: number;
  discountAmount?: number | null;
  totalAmount?: number | null;
  refundedAmount?: number | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  periodFrom: Date;
  periodTo: Date;
}): Map<string, number> {
  const gross = saleLineKeptAmounts({ ...input, refundedAmount: 0 });
  const kept = saleLineKeptAmounts(input);
  const refunded = Math.max(0, Number(input.refundedAmount) || 0);
  const paidInPeriod = instantInPayPeriod(input.paidAt, input.periodFrom, input.periodTo);
  const refundInPeriod = instantInPayPeriod(input.refundedAt, input.periodFrom, input.periodTo);
  const out = new Map<string, number>();
  for (const line of input.lines) {
    const grossAmount = gross.get(line.id) ?? 0;
    const keptAmount = kept.get(line.id) ?? 0;
    const returned = Math.max(0, subtractMoney(grossAmount, keptAmount));
    let value = 0;
    if (paidInPeriod && (refundInPeriod || (refunded > 0 && !input.refundedAt))) value = keptAmount;
    else if (paidInPeriod) value = grossAmount;
    else if (refundInPeriod) value = returned > 0 ? -returned : 0;
    if (value !== 0) out.set(line.id, value);
  }
  return out;
}

function instantInPayPeriod(value: string | null | undefined, from: Date, to: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= from.getTime() && time <= to.getTime();
}

/**
 * A till line for one pay period.
 * The sale counts when it is paid. A return counts when it is refunded.
 * A return with no refund date stays on the sale's pay period.
 */
export function walkInLineInPeriod(input: {
  lineTotal: number;
  subtotal: number;
  discountAmount?: number | null;
  totalAmount?: number | null;
  refundedAmount?: number | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  periodFrom: Date;
  periodTo: Date;
}): number {
  const gross = walkInRealizedLineAmount({ ...input, refundedAmount: 0 });
  const kept = walkInRealizedLineAmount(input);
  const returned = Math.max(0, subtractMoney(gross, kept));
  const paidInPeriod = instantInPayPeriod(input.paidAt, input.periodFrom, input.periodTo);
  const refundInPeriod = instantInPayPeriod(input.refundedAt, input.periodFrom, input.periodTo);
  const refunded = Math.max(0, Number(input.refundedAmount) || 0);

  if (paidInPeriod && (refundInPeriod || (refunded > 0 && !input.refundedAt))) return kept;
  if (paidInPeriod) return gross;
  if (refundInPeriod) return returned > 0 ? -returned : 0;
  return 0;
}

/**
 * A product on a till sale. A full refund uses the sale's update time as the return.
 * Booking payments recorded as till sales are left to the appointment.
 */
export function posSaleLineInPeriod(input: {
  lineTotal: number;
  subtotal: number;
  discountAmount?: number | null;
  totalAmount?: number | null;
  paymentStatus?: string | null;
  notes?: string | null;
  saleDate?: string | null;
  updatedAt?: string | null;
  periodFrom: Date;
  periodTo: Date;
}): number {
  if (isBookingCollectionSale(input.notes)) return 0;
  const status = String(input.paymentStatus ?? "completed").toLowerCase();
  if (status !== "completed" && status !== "refunded") return 0;
  const refunded = status === "refunded";
  return walkInLineInPeriod({
    lineTotal: input.lineTotal,
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    totalAmount: input.totalAmount,
    refundedAmount: refunded ? Number(input.totalAmount || 0) : 0,
    paidAt: input.saleDate,
    refundedAt: refunded ? input.updatedAt : null,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
  });
}

export function posSaleLinesInPeriod(input: {
  lines: ReadonlyArray<{ id: string; lineTotal: number }>;
  subtotal: number;
  discountAmount?: number | null;
  totalAmount?: number | null;
  paymentStatus?: string | null;
  notes?: string | null;
  saleDate?: string | null;
  updatedAt?: string | null;
  periodFrom: Date;
  periodTo: Date;
}): Map<string, number> {
  if (isBookingCollectionSale(input.notes)) return new Map();
  const status = String(input.paymentStatus ?? "completed").toLowerCase();
  if (status !== "completed" && status !== "refunded") return new Map();
  const refunded = status === "refunded";
  return saleLinesInPeriod({
    lines: input.lines,
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    totalAmount: input.totalAmount,
    refundedAmount: refunded ? Number(input.totalAmount || 0) : 0,
    paidAt: input.saleDate,
    refundedAt: refunded ? input.updatedAt : null,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
  });
}

/**
 * A till service. A later refund comes off at this service's own rate, not the tier crossed by other sales.
 */
export function posServiceCommissionAmount(input: {
  realizedNet: number;
  staffPays: boolean;
  overrideRate?: number | null;
  baseRate: number;
  tierRate: number;
}): {
  tierRevenue: number;
  overrideRevenue: number;
  overrideCommission: number;
  commission: number;
  returnCommission: number;
} {
  const none = { tierRevenue: 0, overrideRevenue: 0, overrideCommission: 0, commission: 0, returnCommission: 0 };
  if (!input.staffPays || input.realizedNet === 0) return none;
  if (input.realizedNet < 0) {
    const rate = input.overrideRate != null ? input.overrideRate : input.baseRate;
    return { ...none, returnCommission: percentOf(input.realizedNet, rate) };
  }
  if (input.overrideRate != null) {
    const amount = percentOf(input.realizedNet, input.overrideRate);
    return { ...none, overrideRevenue: input.realizedNet, overrideCommission: amount, commission: amount };
  }
  return {
    ...none,
    tierRevenue: input.realizedNet,
    commission: percentOf(input.realizedNet, input.tierRate),
  };
}

/** A tip typed on a till sale. It follows the sale week and the refund week. */
export function posSaleTipInPeriod(input: {
  notes?: string | null;
  paymentStatus?: string | null;
  saleDate?: string | null;
  updatedAt?: string | null;
  periodFrom: Date;
  periodTo: Date;
}): number {
  const tip = parseTipFromSaleNotes(input.notes);
  if (tip <= 0) return 0;
  return posSaleLineInPeriod({
    lineTotal: tip,
    subtotal: tip,
    totalAmount: tip,
    paymentStatus: input.paymentStatus,
    notes: input.notes,
    saleDate: input.saleDate,
    updatedAt: input.updatedAt,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
  });
}

/** booking_addons.price is the unit price. Two glosses at R25 are R50. */
export function addonLinePrice(price: number, quantity?: number | null): number {
  const qty = Math.max(1, Math.floor(Number(quantity ?? 1)) || 1);
  return multiplyMoney(Math.max(0, Number(price) || 0), qty);
}

function addonServiceMatches(service: AddonServiceLine, scope: string[]): boolean {
  if (scope.includes(service.offeringId)) return true;
  return service.masterServiceId != null && scope.includes(service.masterServiceId);
}

/** Split an amount across parts so the shares add up to it. The extra cent goes to the earliest name. */
export function pooledShare(input: {
  amount: number;
  parts: ReadonlyArray<{ id: string; weight: number }>;
  id: string;
}): number {
  if (input.amount === 0) return 0;
  const negative = input.amount < 0;
  const weightById = new Map<string, number>();
  for (const part of input.parts) {
    if (!part.id || part.weight <= 0) continue;
    weightById.set(part.id, addMoney(weightById.get(part.id) ?? 0, part.weight));
  }
  if ((weightById.get(input.id) ?? 0) <= 0) return 0;
  const ids = [...weightById.keys()].sort();
  const weightCents = ids.map((id) => toMinorUnits(weightById.get(id) ?? 0));
  const totalWeight = weightCents.reduce((sum, cents) => sum + cents, 0);
  if (totalWeight <= 0) return 0;
  const amountCents = toMinorUnits(Math.abs(input.amount));
  const shares = weightCents.map((cents) => Math.floor((amountCents * cents) / totalWeight));
  let leftover = amountCents - shares.reduce((sum, cents) => sum + cents, 0);
  const ranked = shares
    .map((_, index) => ({ index, frac: (amountCents * weightCents[index]) % totalWeight }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; i < ranked.length && leftover > 0; i += 1) {
    shares[ranked[i].index] += 1;
    leftover -= 1;
  }
  const index = ids.indexOf(input.id);
  const share = fromMinorUnits(shares[index] ?? 0);
  return negative ? -share : share;
}

function serviceLineRevenueShare(
  bookingRevenue: number,
  services: Array<{ id?: string; price?: number }>,
  service: { id?: string },
): number {
  if (bookingRevenue <= 0) return 0;
  const line = services.indexOf(service);
  return pooledShare({
    amount: bookingRevenue,
    parts: services.map((row, index) => ({
      id: row.id ? String(row.id) : `line-${index}`,
      weight: Number(row.price || 0),
    })),
    id: service.id ? String(service.id) : `line-${line}`,
  });
}

/** Keep the service share from the bill. Split again only for money the bill did not assign. */
export function serviceAmountAfterBillSplit(input: {
  pool: number;
  services: ReadonlyArray<{ id: string; price: number; billShare: number | null }>;
  serviceId: string;
}): number {
  const service = input.services.find((row) => row.id === input.serviceId);
  if (!service) return 0;
  if (input.services.some((row) => row.billShare == null)) {
    return serviceLineRevenueShare(
      input.pool,
      input.services.map((row) => ({ id: row.id, price: row.price })),
      { id: service.id },
    );
  }
  const assigned = input.services.reduce((sum, row) => addMoney(sum, row.billShare ?? 0), 0);
  const leftover = subtractMoney(input.pool, assigned);
  if (leftover === 0) return service.billShare ?? 0;
  if (leftover < 0) {
    return pooledShare({
      amount: input.pool,
      parts: input.services.map((row) => ({ id: row.id, weight: row.billShare ?? 0 })),
      id: service.id,
    });
  }
  return addMoney(
    service.billShare ?? 0,
    pooledShare({
      amount: leftover,
      parts: input.services.map((row) => ({ id: row.id, weight: row.price })),
      id: service.id,
    }),
  );
}

/**
 * An add-on's paid amount goes to the stylist on the service it belongs to.
 * If that service has no stylist, the stylists on the appointment share it.
 * No applicable services means it is split across those stylists.
 */
export function addonShareForStaff(input: {
  paidAmount: number;
  staffId: string;
  services: AddonServiceLine[];
  applicableServiceIds?: string[] | null;
}): number {
  if (input.paidAmount <= 0) return 0;
  const scope = input.applicableServiceIds ?? [];
  const scoped = scope.length
    ? input.services.filter((service) => addonServiceMatches(service, scope))
    : input.services;
  if (scope.length > 0 && scoped.length === 0) return 0;
  const matchedWithStaff = scoped.filter((service) => service.staffId);
  const pool = matchedWithStaff.length > 0 ? matchedWithStaff : input.services.filter((service) => service.staffId);
  const priced = pool.filter((service) => service.price > 0);
  const base = priced.length > 0 ? priced : pool;
  if (base.length === 0) return 0;
  if (priced.length === 0) {
    const stylists = [...new Set(base.map((service) => service.staffId).filter((id): id is string => Boolean(id)))];
    return pooledShare({
      amount: input.paidAmount,
      parts: stylists.map((id) => ({ id, weight: 1 })),
      id: input.staffId,
    });
  }
  const weightById = new Map<string, number>();
  for (const service of base) {
    if (!service.staffId) continue;
    weightById.set(service.staffId, addMoney(weightById.get(service.staffId) ?? 0, service.price));
  }
  return pooledShare({
    amount: input.paidAmount,
    parts: [...weightById.entries()].map(([id, weight]) => ({ id, weight })),
    id: input.staffId,
  });
}

/**
 * The stylist on the matching service is paid the add-on.
 * The saved service line still contains each stylist's service-price share of that add-on.
 */
export function addonPayAndStoredShare(input: {
  paidAmount: number;
  staffId: string;
  services: AddonServiceLine[];
  applicableServiceIds?: string[] | null;
}): { pay: number; inStoredService: number } {
  return {
    pay: addonShareForStaff(input),
    inStoredService: addonShareForStaff({ ...input, applicableServiceIds: null }),
  };
}

/**
 * A product with a stylist is paid to that stylist.
 * A product with nobody named is shared by the stylists on the appointment, by service price.
 */
export function appointmentProductShareForStaff(input: {
  paidAmount: number;
  staffId: string;
  productStaffId?: string | null;
  services: { staffId: string | null; price: number }[];
}): number {
  if (input.paidAmount <= 0) return 0;
  if (input.productStaffId) {
    return input.productStaffId === input.staffId ? input.paidAmount : 0;
  }
  const withStaff = input.services.filter((service) => service.staffId);
  const priced = withStaff.filter((service) => service.price > 0);
  if (priced.length === 0) {
    const stylists = [...new Set(withStaff.map((service) => service.staffId).filter((id): id is string => Boolean(id)))];
    return pooledShare({
      amount: input.paidAmount,
      parts: stylists.map((id) => ({ id, weight: 1 })),
      id: input.staffId,
    });
  }
  const weightById = new Map<string, number>();
  for (const service of priced) {
    if (!service.staffId) continue;
    weightById.set(service.staffId, addMoney(weightById.get(service.staffId) ?? 0, service.price));
  }
  return pooledShare({
    amount: input.paidAmount,
    parts: [...weightById.entries()].map(([id, weight]) => ({ id, weight })),
    id: input.staffId,
  });
}

/**
 * The named stylist is paid the product.
 * The saved service line still contains each stylist's service-price share of that product.
 */
export function appointmentProductPayAndStoredShare(input: {
  paidAmount: number;
  staffId: string;
  productStaffId?: string | null;
  services: { staffId: string | null; price: number }[];
}): { pay: number; inStoredService: number } {
  return {
    pay: appointmentProductShareForStaff(input),
    inStoredService: appointmentProductShareForStaff({ ...input, productStaffId: null }),
  };
}

/** Take an add-on out of the service amount only when someone is paid for it, or commission is off. */
export function addonRemovedFromServicePool(input: {
  paidAmount: number;
  commissionEnabled: boolean;
  services: AddonServiceLine[];
  applicableServiceIds?: string[] | null;
}): boolean {
  if (input.paidAmount <= 0) return false;
  if (!input.commissionEnabled) return true;
  const staffIds = [
    ...new Set(input.services.map((service) => service.staffId).filter((id): id is string => Boolean(id))),
  ];
  return staffIds.some(
    (staffId) =>
      addonShareForStaff({
        paidAmount: input.paidAmount,
        staffId,
        services: input.services,
        applicableServiceIds: input.applicableServiceIds,
      }) > 0,
  );
}

/**
 * Calculate commission for a staff member within a date range.
 * Uses finance_transactions for actual paid amounts (not raw booking price).
 * Respects team_member_commission_enabled on offerings and products.
 */
export async function calculateStaffCommission(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  staffId: string,
  fromDate: Date,
  toDate: Date,
  locationId?: string | null
): Promise<CommissionResult> {
  const result: CommissionResult = {
    serviceCommission: 0,
    productCommission: 0,
    totalCommission: 0,
    serviceRevenue: 0,
    productRevenue: 0,
    totalRevenue: 0,
    totalBookings: 0,
    serviceOverrideCommission: 0,
    serviceOverrideRevenue: 0,
    productOverrideRevenue: 0,
    posServiceTierRevenue: 0,
    posServiceOverrideCommission: 0,
    posServiceCommission: 0,
    productOverrideCommission: 0,
    serviceTierRevenue: 0,
    productTierRevenue: 0,
    returnCommission: 0,
    returnBaseProductRevenue: 0,
    returnBaseProductCommission: 0,
    returnBaseServiceRevenue: 0,
    returnBaseServiceCommission: 0,
    appointmentProductRevenue: 0,
    serviceExcludesAppointmentRetail: false,
    serviceExcludesAddons: false,
    serviceAdjustedBookingIds: [],
    serviceCommissionOnAdjustedBookings: 0,
    adjustedServiceKeptRevenue: 0,
    adjustedServiceExcludedRevenue: 0,
    adjustedOwnRateAddonCommission: 0,
    appointmentProductRevenueOnServicedBookings: 0,
    adjustedVisits: [],
    refundsNettedBookingIds: [],
  };

  // 1. Get staff commission settings
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("provider_staff")
    .select(
      "id, user_id, commission_enabled, service_commission_rate, product_commission_rate, commission_rate, commission_percentage"
    )
    .eq("id", staffId)
    .eq("provider_id", providerId)
    .single();

  if (staffError || !staff) {
    return result;
  }

  const { serviceRate: baseServiceRate, productRate: baseProductRate } = resolveStaffRates(staff);

  if (staff.commission_enabled === false && baseServiceRate === 0 && baseProductRate === 0) {
    return result;
  }

  // 2. Get provider revenue by booking for commission base: provider_earnings only (not travel_fee/tip).
  const { revenueByBooking: collectedByBooking } = await getProviderRevenue(
    supabaseAdmin,
    providerId,
    fromDate,
    toDate,
    locationId ?? null,
    { transactionTypes: STAFF_COMMISSION_REVENUE_TYPES }
  );

  let revenueByBooking = collectedByBooking;
  try {
    const refundQuery = supabaseAdmin
      .from("finance_transactions")
      .select("id, booking_id, amount, net, refund_component, created_at")
      .eq("provider_id", providerId)
      .eq("transaction_type", "refund")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const refundRows = await fetchAllLedgerPages<AppointmentCommissionRefund>(
      refundQuery as unknown as Parameters<typeof fetchAllLedgerPages>[0],
    );
    const netted = netBookingRevenueAfterRefunds(collectedByBooking, refundRows);
    revenueByBooking = netted.revenueByBooking;
    result.refundsNettedBookingIds = netted.bookingsReduced;
  } catch {
    // A refund read must not stop the pay run. The period still commissions what was collected.
  }

  // 3. Bookings that were paid in this period, even when the appointment is on another day.
  const paidIds = paidBookingIds(revenueByBooking);
  const bookings: any[] = [];
  const bookingChunk = 80;
  for (let i = 0; i < paidIds.length; i += bookingChunk) {
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
      id,
      status,
      scheduled_at,
      subtotal,
      discount_amount,
      promotion_discount_amount,
      membership_discount_amount,
      loyalty_discount_amount,
      booking_services (
        id,
        price,
        staff_id,
        offering_id
      )
    `,
      )
      .eq("provider_id", providerId)
      .in("id", paidIds.slice(i, i + bookingChunk))
      .in("status", [...COMMISSION_BOOKING_STATUSES]);
    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }
    const { data: bookingsData } = await bookingsQuery;
    if (bookingsData) bookings.push(...bookingsData);
  }

  // Get offering_ids for team_member_commission_enabled check
  const offeringIds = new Set<string>();
  for (const b of bookings) {
    for (const s of (b as any).booking_services || []) {
      if (s.offering_id) offeringIds.add(s.offering_id);
    }
  }
  const offeringMap = new Map<
    string,
    {
      team_member_commission_enabled?: boolean;
      commission_rate_override?: number;
      master_service_id?: string | null;
      applicable_service_ids?: string[] | null;
    }
  >();
  if (offeringIds.size > 0) {
    const { data: offerings } = await supabaseAdmin
      .from("offerings")
      .select(
        "id, team_member_commission_enabled, commission_rate_override, master_service_id, applicable_service_ids",
      )
      .in("id", Array.from(offeringIds));
    for (const o of offerings || []) {
      offeringMap.set((o as any).id, o);
    }
  }

  let bookingProducts: any[] = [];
  let saleItems: any[] = [];
  const productMap = new Map<string, { team_member_commission_enabled?: boolean; commission_rate_override?: number }>();
  const bookingIds = (bookings || []).map((b: any) => b.id).filter(Boolean);
  if (bookingIds.length > 0) {
    const { data: bpData } = await supabaseAdmin
      .from("booking_products")
      .select("id, total_price, staff_id, product_id, booking_id")
      .in("booking_id", bookingIds);
    if (bpData) {
      bookingProducts = bpData;
      const productIds = [...new Set(bookingProducts.map((bp: any) => bp.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const { data: products } = await supabaseAdmin
          .from("products")
          .select("id, team_member_commission_enabled, commission_rate_override")
          .in("id", productIds);
        for (const p of products || []) {
          productMap.set((p as any).id, p);
        }
      }
    }
  }
  const retailByBooking = new Map<string, number>();
  const paidByRow = new Map<object, number>();

  let bookingAddons: Array<{
    booking_id?: string;
    addon_id?: string;
    price?: number;
    quantity?: number | null;
  }> = [];
  if (bookingIds.length > 0) {
    const { data: addonRows } = await supabaseAdmin
      .from("booking_addons")
      .select("booking_id, addon_id, price, quantity")
      .in("booking_id", bookingIds);
    bookingAddons = addonRows ?? [];
    const missingAddonIds = [
      ...new Set(bookingAddons.map((row) => row.addon_id).filter((id): id is string => Boolean(id))),
    ].filter((id) => !offeringMap.has(id));
    if (missingAddonIds.length > 0) {
      const { data: addonOfferings } = await supabaseAdmin
        .from("offerings")
        .select("id, team_member_commission_enabled, commission_rate_override, applicable_service_ids, master_service_id")
        .in("id", missingAddonIds);
      for (const offering of addonOfferings || []) {
        offeringMap.set((offering as { id: string }).id, offering);
      }
    }
  }
  for (const booking of bookings) {
    const products = bookingProducts.filter((bp: { booking_id?: string }) => bp.booking_id === booking.id);
    const addons = bookingAddons.filter((addon) => addon.booking_id === booking.id);
    if (products.length === 0 && addons.length === 0) continue;
    const services = (booking as { booking_services?: Array<{ price?: number }> }).booking_services ?? [];
    const shares = paidAppointmentLineShares({
      lines: [
        ...services.map((svc, index) => ({ id: `service-${index}`, price: Number(svc.price || 0) })),
        ...products.map((bp: { total_price?: number }, index) => ({
          id: `product-${index}`,
          price: Number(bp.total_price || 0),
        })),
        ...addons.map((addon, index) => ({
          id: `addon-${index}`,
          price: addonLinePrice(Number(addon.price || 0), addon.quantity),
        })),
      ],
      bookingPaidAmount: revenueByBooking.get(booking.id) || 0,
      bill: appointmentRetailBill(booking),
    });
    products.forEach((bp: { booking_id?: string }, index) => {
      const amount = shares.get(`product-${index}`) ?? 0;
      paidByRow.set(bp, amount);
      if (amount <= 0) return;
      const bookingId = String(bp.booking_id);
      retailByBooking.set(bookingId, addMoney(retailByBooking.get(bookingId) || 0, amount));
    });
    addons.forEach((addon, index) => {
      paidByRow.set(addon, shares.get(`addon-${index}`) ?? 0);
    });
    services.forEach((svc, index) => {
      paidByRow.set(svc, shares.get(`service-${index}`) ?? 0);
    });
  }
  const addonByBooking = new Map<string, number>();
  for (const addon of bookingAddons) {
    const bookingId = String(addon.booking_id ?? "");
    const amount = paidByRow.get(addon) ?? 0;
    if (amount <= 0 || !bookingId) continue;
    const booking = bookings.find((row: { id?: string }) => row.id === bookingId);
    const services = ((booking as { booking_services?: Array<{ offering_id?: string; staff_id?: string | null; price?: number }> })
      ?.booking_services ?? []).map((svc) => ({
      offeringId: String(svc.offering_id ?? ""),
      staffId: svc.staff_id ?? null,
      price: Number(svc.price || 0),
      masterServiceId: offeringMap.get(String(svc.offering_id ?? ""))?.master_service_id,
    }));
    const addonOffering = offeringMap.get(String(addon.addon_id ?? ""));
    if (
      !addonRemovedFromServicePool({
        paidAmount: amount,
        commissionEnabled: addonOffering?.team_member_commission_enabled !== false,
        services,
        applicableServiceIds: addonOffering?.applicable_service_ids,
      })
    ) {
      continue;
    }
    addonByBooking.set(bookingId, addMoney(addonByBooking.get(bookingId) || 0, amount));
  }

  const servicePool = (bookingId: string) =>
    serviceRevenueAfterRetail(
      revenueByBooking.get(bookingId) || 0,
      addMoney(retailByBooking.get(bookingId) || 0, addonByBooking.get(bookingId) || 0),
    );

  // 4. Calculate service revenue and commission
  for (const booking of bookings) {
    const bookingRevenue = servicePool(booking.id);
    const services = (booking as any).booking_services || [];
    if (services.length === 0) continue;

    const totalServicePrice = services.reduce(
      (sum: number, s: any) => addMoney(sum, Number(s.price || 0)),
      0
    );

    const staffServices = services.filter((s: any) => s.staff_id === staffId);
    if (staffServices.length === 0) continue;

    if ((retailByBooking.get(booking.id) || 0) > 0) {
      result.serviceExcludesAppointmentRetail = true;
    }
    if ((addonByBooking.get(booking.id) || 0) > 0) {
      result.serviceExcludesAddons = true;
    }
    result.totalBookings += 1;

    let staffRevenueShare = 0;
    for (const svc of staffServices) {
      const offering = offeringMap.get(svc.offering_id);
      const commissionEnabled = offering?.team_member_commission_enabled !== false;
      if (!commissionEnabled) continue;
      const revShare = serviceAmountAfterBillSplit({
        pool: bookingRevenue,
        services: services.map((row: { id?: string; price?: number }, index: number) => ({
          id: row.id ? String(row.id) : `line-${index}`,
          price: Number(row.price || 0),
          billShare: paidByRow.has(row) ? (paidByRow.get(row) ?? 0) : null,
        })),
        serviceId: svc.id ? String(svc.id) : `line-${services.indexOf(svc)}`,
      });
      staffRevenueShare = addMoney(staffRevenueShare, revShare);
      const overrideRate = offering?.commission_rate_override;
      const effectiveRate = overrideRate != null ? overrideRate : baseServiceRate;
      result.serviceCommission = addMoney(
        result.serviceCommission,
        percentOf(revShare, staff.commission_enabled !== false ? effectiveRate : 0),
      );
    }
    result.serviceRevenue = addMoney(result.serviceRevenue, staffRevenueShare);
    for (const addon of bookingAddons) {
      if (addon.booking_id !== booking.id) continue;
      const offering = offeringMap.get(addon.addon_id ?? "");
      if (offering?.team_member_commission_enabled === false) continue;
      const paid = paidByRow.get(addon) ?? 0;
      const share = addonShareForStaff({
        paidAmount: paid,
        staffId,
        services: services.map((svc: { offering_id?: string; staff_id?: string | null; price?: number }) => ({
          offeringId: String(svc.offering_id ?? ""),
          staffId: svc.staff_id ?? null,
          price: Number(svc.price || 0),
          masterServiceId: offeringMap.get(String(svc.offering_id ?? ""))?.master_service_id,
        })),
        applicableServiceIds: (offering as { applicable_service_ids?: string[] | null } | undefined)
          ?.applicable_service_ids,
      });
      result.serviceRevenue = addMoney(result.serviceRevenue, share);
    }
  }

  // 5. Appointment retail is commissioned on its own line, not inside the service amount.
  for (const bp of bookingProducts) {
        const product = productMap.get((bp as any).product_id);
        const commissionEnabled = product?.team_member_commission_enabled !== false;
        if (!commissionEnabled) continue;

        const booking = bookings.find((b: any) => b.id === (bp as any).booking_id);
        const price = appointmentProductShareForStaff({
          paidAmount: paidByRow.get(bp) ?? 0,
          staffId,
          productStaffId: (bp as any).staff_id,
          services: ((booking as any)?.booking_services ?? []).map((svc: { staff_id?: string | null; price?: number }) => ({
            staffId: svc.staff_id ?? null,
            price: Number(svc.price || 0),
          })),
        });
        if (price <= 0) continue;
        const servicedByStaff = ((booking as { booking_services?: Array<{ staff_id?: string | null }> })
          ?.booking_services ?? []).some((svc) => svc.staff_id === staffId);
        if (servicedByStaff) {
          result.appointmentProductRevenueOnServicedBookings = addMoney(
            result.appointmentProductRevenueOnServicedBookings,
            price,
          );
        }
        result.appointmentProductRevenue = addMoney(result.appointmentProductRevenue, price);
        result.productRevenue = addMoney(result.productRevenue, price);
        const prodRate = product?.commission_rate_override != null ? product.commission_rate_override : baseProductRate;
        result.productCommission = addMoney(
          result.productCommission,
          percentOf(price, staff.commission_enabled !== false ? prodRate : 0),
        );
  }

  // 6. Walk-in product_orders (POS adapter + native walk-in) + legacy sales
  const walkInLines: Array<{ product_id: string | null; realizedNet: number }> = [];
  const posServiceLines: Array<{ offering_id: string | null; realizedNet: number }> = [];
  {
    const staffUserId = (staff as { user_id?: string | null }).user_id ?? null;
    const staffMatchers = [staffId, staffUserId].filter(Boolean) as string[];
    const walkInSelect =
      "id, staff_id, subtotal, discount_amount, total_amount, tax_amount, refunded_amount, paid_at, refunded_at, collection_location_id";
    let paidQuery = supabaseAdmin
      .from("product_orders")
      .select(walkInSelect)
      .eq("provider_id", providerId)
      .eq("order_source", "walk_in")
      .in("payment_status", ["paid", "partially_refunded", "refunded"])
      .in("staff_id", staffMatchers)
      .gte("paid_at", fromDate.toISOString())
      .lte("paid_at", toDate.toISOString());
    let returnQuery = supabaseAdmin
      .from("product_orders")
      .select(walkInSelect)
      .eq("provider_id", providerId)
      .eq("order_source", "walk_in")
      .in("payment_status", ["partially_refunded", "refunded"])
      .in("staff_id", staffMatchers)
      .gte("refunded_at", fromDate.toISOString())
      .lte("refunded_at", toDate.toISOString())
      .lt("paid_at", fromDate.toISOString());
    if (locationId) {
      paidQuery = paidQuery.eq("collection_location_id", locationId);
      returnQuery = returnQuery.eq("collection_location_id", locationId);
    }
    const [{ data: paidOrders }, { data: returnedOrders }] = await Promise.all([paidQuery, returnQuery]);
    const walkInOrders = [...(paidOrders ?? []), ...(returnedOrders ?? [])].filter(
      (order, index, list) => list.findIndex((row) => (row as { id: string }).id === (order as { id: string }).id) === index,
    );
    if (walkInOrders && walkInOrders.length > 0) {
      const orderIds = walkInOrders.map((o: { id: string }) => o.id);
      const { data: walkInItems } = await supabaseAdmin
        .from("product_order_items")
        .select("id, order_id, product_id, total_price")
        .in("order_id", orderIds);
      const extraProductIds = [
        ...new Set((walkInItems || []).map((item: { product_id?: string | null }) => item.product_id).filter(Boolean)),
      ] as string[];
      if (extraProductIds.length > 0) {
        const missing = extraProductIds.filter((id) => !productMap.has(id));
        if (missing.length > 0) {
          const { data: products } = await supabaseAdmin
            .from("products")
            .select("id, team_member_commission_enabled, commission_rate_override")
            .in("id", missing);
          for (const p of products || []) {
            productMap.set((p as { id: string }).id, p);
          }
        }
      }
      const itemsByOrder = new Map<string, Array<{ id?: string; product_id?: string | null; total_price?: number | string | null }>>();
      for (const item of walkInItems || []) {
        const list = itemsByOrder.get((item as { order_id: string }).order_id) ?? [];
        list.push(item);
        itemsByOrder.set((item as { order_id: string }).order_id, list);
      }
      for (const order of walkInOrders) {
        const orderRow = order as {
          id: string;
          subtotal?: number | string | null;
          discount_amount?: number | string | null;
          total_amount?: number | string | null;
          refunded_amount?: number | string | null;
          paid_at?: string | null;
          refunded_at?: string | null;
        };
        const orderItems = itemsByOrder.get(orderRow.id) || [];
        const lineAmounts = saleLinesInPeriod({
          lines: orderItems.map((item, index) => ({
            id: String(item.id ?? index),
            lineTotal: Number(item.total_price || 0),
          })),
          subtotal: Number(orderRow.subtotal || 0),
          discountAmount: Number(orderRow.discount_amount || 0),
          totalAmount: Number(orderRow.total_amount || 0),
          refundedAmount: Number(orderRow.refunded_amount || 0),
          paidAt: orderRow.paid_at,
          refundedAt: orderRow.refunded_at,
          periodFrom: fromDate,
          periodTo: toDate,
        });
        for (const [index, item] of orderItems.entries()) {
          const product = item.product_id ? productMap.get(item.product_id) : undefined;
          if (product?.team_member_commission_enabled === false) continue;
          const realizedNet = lineAmounts.get(String(item.id ?? index)) ?? 0;
          if (realizedNet === 0) continue;
          walkInLines.push({ product_id: item.product_id ?? null, realizedNet });
          if (realizedNet > 0) result.productRevenue = addMoney(result.productRevenue, realizedNet);
          const prodRate =
            product?.commission_rate_override != null ? product.commission_rate_override : baseProductRate;
          result.productCommission = addMoney(
            result.productCommission,
            percentOf(realizedNet, staff.commission_enabled !== false ? prodRate : 0),
          );
        }
      }
    }
  }

  // 7. Till sales. A refunded sale stays on the week it was paid and comes off the week it was refunded.
  const saleSelect =
    "id, staff_id, subtotal, discount_amount, total_amount, sale_date, payment_status, notes, updated_at";
  let paidSalesQuery = supabaseAdmin
    .from("sales")
    .select(saleSelect)
    .eq("provider_id", providerId)
    .eq("staff_id", staffId)
    .gte("sale_date", fromDate.toISOString())
    .lte("sale_date", toDate.toISOString())
    .in("payment_status", ["completed", "refunded"]);
  let returnedSalesQuery = supabaseAdmin
    .from("sales")
    .select(saleSelect)
    .eq("provider_id", providerId)
    .eq("staff_id", staffId)
    .eq("payment_status", "refunded")
    .gte("updated_at", fromDate.toISOString())
    .lte("updated_at", toDate.toISOString())
    .lt("sale_date", fromDate.toISOString());
  if (locationId) {
    paidSalesQuery = paidSalesQuery.eq("location_id", locationId);
    returnedSalesQuery = returnedSalesQuery.eq("location_id", locationId);
  }
  const [{ data: paidSales }, { data: returnedSales }] = await Promise.all([
    paidSalesQuery,
    returnedSalesQuery,
  ]);
  const commissionSales = [...(paidSales ?? []), ...(returnedSales ?? [])].filter(
    (sale, index, list) =>
      list.findIndex((row) => (row as { id: string }).id === (sale as { id: string }).id) === index,
  );
  if (commissionSales.length > 0) {
    const { data: saleItemsData } = await supabaseAdmin
      .from("sale_items")
      .select("id, sale_id, item_type, total_price, item_id")
      .in(
        "sale_id",
        commissionSales.map((s: { id: string }) => s.id),
      );

    if (saleItemsData) {
      const saleById = new Map(commissionSales.map((sale: { id: string }) => [sale.id, sale]));
      const saleProductIds = [
        ...new Set(
          saleItemsData
            .filter((item: { item_type?: string | null }) => String(item.item_type || "product") !== "service")
            .map((item: { item_id?: string | null }) => item.item_id)
            .filter((id: string | null | undefined): id is string => Boolean(id)),
        ),
      ];
      const saleOfferingIds = [
        ...new Set(
          saleItemsData
            .filter((item: { item_type?: string | null }) => String(item.item_type || "") === "service")
            .map((item: { item_id?: string | null }) => item.item_id)
            .filter((id: string | null | undefined): id is string => Boolean(id) && !offeringMap.has(id)),
        ),
      ];
      if (saleOfferingIds.length > 0) {
        const { data: offerings } = await supabaseAdmin
          .from("offerings")
          .select("id, team_member_commission_enabled, commission_rate_override, master_service_id")
          .in("id", saleOfferingIds);
        for (const offering of offerings || []) {
          offeringMap.set((offering as { id: string }).id, offering);
        }
      }
      const missingProducts = saleProductIds.filter((id) => !productMap.has(id));
      if (missingProducts.length > 0) {
        const { data: products } = await supabaseAdmin
          .from("products")
          .select("id, team_member_commission_enabled, commission_rate_override")
          .in("id", missingProducts);
        for (const p of products || []) {
          productMap.set((p as { id: string }).id, p);
        }
      }
      const itemsBySale = new Map<string, typeof saleItemsData>();
      for (const item of saleItemsData) {
        const saleId = String((item as { sale_id?: string }).sale_id ?? "");
        const list = itemsBySale.get(saleId) ?? [];
        list.push(item);
        itemsBySale.set(saleId, list);
      }
      for (const [saleId, items] of itemsBySale) {
        const sale = saleById.get(saleId) as
          | {
              subtotal?: number | string | null;
              discount_amount?: number | string | null;
              total_amount?: number | string | null;
              payment_status?: string | null;
              notes?: string | null;
              sale_date?: string | null;
              updated_at?: string | null;
            }
          | undefined;
        const lineAmounts = posSaleLinesInPeriod({
          lines: items.map((item) => ({
            id: String((item as { id?: string }).id ?? ""),
            lineTotal: Number((item as { total_price?: number | string | null }).total_price || 0),
          })),
          subtotal: Number(sale?.subtotal || 0),
          discountAmount: Number(sale?.discount_amount || 0),
          totalAmount: Number(sale?.total_amount || 0),
          paymentStatus: sale?.payment_status,
          notes: sale?.notes,
          saleDate: sale?.sale_date,
          updatedAt: sale?.updated_at,
          periodFrom: fromDate,
          periodTo: toDate,
        });
        for (const item of items) {
        const itemType = String((item as { item_type?: string | null }).item_type || "product");
        const itemId = (item as { item_id?: string | null }).item_id ?? null;
        const realizedNet = lineAmounts.get(String((item as { id?: string }).id ?? "")) ?? 0;
        if (realizedNet === 0) continue;
        if (itemType === "service") {
          const offering = itemId ? offeringMap.get(itemId) : undefined;
          if (offering?.team_member_commission_enabled === false) continue;
          posServiceLines.push({ offering_id: itemId, realizedNet });
          if (realizedNet > 0) result.serviceRevenue = addMoney(result.serviceRevenue, realizedNet);
          continue;
        }
        const product = itemId ? productMap.get(itemId) : undefined;
        if (product?.team_member_commission_enabled === false) continue;
        walkInLines.push({
          product_id: itemId,
          realizedNet,
        });
        if (realizedNet > 0) result.productRevenue = addMoney(result.productRevenue, realizedNet);
      }
    }
    }
  }

  result.totalRevenue = sumMoney(result.serviceRevenue, result.productRevenue);

  // Apply tiered commission: if staff has tiers, the tier rate overrides base rate for items without override
  const { data: tiers } = await supabaseAdmin
    .from("provider_staff_commission_tiers")
    .select("min_revenue, commission_rate")
    .eq("staff_id", staffId)
    .order("min_revenue", { ascending: false });

  let tierRate: number | null = null;
  if (tiers && tiers.length > 0) {
    const sorted = [...tiers].sort((a: any, b: any) => Number(b.min_revenue || 0) - Number(a.min_revenue || 0));
    const qualifying = sorted.find((t: any) => result.totalRevenue >= Number(t.min_revenue || 0));
    if (qualifying) tierRate = Number(qualifying.commission_rate || 0);
  }

  const effectiveServiceRate = tierRate ?? baseServiceRate;
  const effectiveProductRate = tierRate ?? baseProductRate;

  // Recompute commission with tier rate for items that used base rate (no override)
  result.serviceCommission = 0;
  result.productCommission = 0;
  const adjustedVisit = new Map<
    string,
    {
      keptRevenue: number;
      excludedRevenue: number;
      ownRateAddonCommission: number;
      serviceRateAddonPay: number;
      calculatedCommission: number;
    }
  >();
  const noteVisit = (
    bookingId: string,
    part: "keptRevenue" | "excludedRevenue" | "ownRateAddonCommission" | "serviceRateAddonPay" | "calculatedCommission",
    amount: number,
  ) => {
    const id = String(bookingId);
    const row = adjustedVisit.get(id) ?? {
      keptRevenue: 0,
      excludedRevenue: 0,
      ownRateAddonCommission: 0,
      serviceRateAddonPay: 0,
      calculatedCommission: 0,
    };
    row[part] = addMoney(row[part], amount);
    adjustedVisit.set(id, row);
  };

  for (const booking of bookings) {
    const serviceCommissionBeforeBooking = result.serviceCommission;
    const bookingRevenue = servicePool(booking.id);
    const services = (booking as any).booking_services || [];
    const totalServicePrice = services.reduce((s: number, x: any) => addMoney(s, Number(x.price || 0)), 0);
    const staffServices = services.filter((s: any) => s.staff_id === staffId);
    if (staffServices.length === 0) continue;
    const bookingAdjusted =
      staffServices.length > 0 &&
      ((retailByBooking.get(booking.id) || 0) > 0 || (addonByBooking.get(booking.id) || 0) > 0);
    if (totalServicePrice > 0) {
    for (const svc of staffServices) {
      const offering = offeringMap.get(svc.offering_id);
      if (offering?.team_member_commission_enabled === false) continue;
      const revShare = serviceAmountAfterBillSplit({
        pool: bookingRevenue,
        services: services.map((row: { id?: string; price?: number }, index: number) => ({
          id: row.id ? String(row.id) : `line-${index}`,
          price: Number(row.price || 0),
          billShare: paidByRow.has(row) ? (paidByRow.get(row) ?? 0) : null,
        })),
        serviceId: svc.id ? String(svc.id) : `line-${services.indexOf(svc)}`,
      });
      if (bookingAdjusted) {
        result.adjustedServiceKeptRevenue = addMoney(result.adjustedServiceKeptRevenue, revShare);
        noteVisit(String(booking.id), "keptRevenue", revShare);
      }
      const staffPays = staff.commission_enabled !== false;
      if (offering?.commission_rate_override != null) {
        const amount = percentOf(revShare, staffPays ? offering.commission_rate_override : 0);
        result.serviceOverrideCommission = addMoney(result.serviceOverrideCommission, amount);
        result.serviceOverrideRevenue = addMoney(result.serviceOverrideRevenue, revShare);
        result.serviceCommission = addMoney(result.serviceCommission, amount);
      } else {
        result.serviceTierRevenue = addMoney(result.serviceTierRevenue, revShare);
        result.serviceCommission = addMoney(
          result.serviceCommission,
          percentOf(revShare, staffPays ? effectiveServiceRate : 0),
        );
      }
    }
    }
    const staffPaysAddon = staff.commission_enabled !== false;
    for (const addon of bookingAddons) {
      if (addon.booking_id !== booking.id) continue;
      const offering = offeringMap.get(addon.addon_id ?? "");
      const paid = paidByRow.get(addon) ?? 0;
      const addonServices = services.map((svc: { offering_id?: string; staff_id?: string | null; price?: number }) => ({
        offeringId: String(svc.offering_id ?? ""),
        staffId: svc.staff_id ?? null,
        price: Number(svc.price || 0),
        masterServiceId: offeringMap.get(String(svc.offering_id ?? ""))?.master_service_id,
      }));
      const split = addonPayAndStoredShare({
        paidAmount: paid,
        staffId,
        services: addonServices,
        applicableServiceIds: (offering as { applicable_service_ids?: string[] | null } | undefined)
          ?.applicable_service_ids,
      });
      const removedFromService = addonRemovedFromServicePool({
        paidAmount: paid,
        commissionEnabled: offering?.team_member_commission_enabled !== false,
        services: addonServices,
        applicableServiceIds: (offering as { applicable_service_ids?: string[] | null } | undefined)
          ?.applicable_service_ids,
      });
      if (bookingAdjusted && removedFromService && split.inStoredService > 0) {
        result.adjustedServiceExcludedRevenue = addMoney(
          result.adjustedServiceExcludedRevenue,
          split.inStoredService,
        );
        noteVisit(String(booking.id), "excludedRevenue", split.inStoredService);
      }
      if (offering?.team_member_commission_enabled === false || split.pay <= 0) continue;
      if (offering?.commission_rate_override != null) {
        const amount = percentOf(split.pay, staffPaysAddon ? offering.commission_rate_override : 0);
        if (bookingAdjusted) {
          result.adjustedOwnRateAddonCommission = addMoney(result.adjustedOwnRateAddonCommission, amount);
          noteVisit(String(booking.id), "ownRateAddonCommission", amount);
        }
        result.serviceOverrideCommission = addMoney(result.serviceOverrideCommission, amount);
        result.serviceOverrideRevenue = addMoney(result.serviceOverrideRevenue, split.pay);
        result.serviceCommission = addMoney(result.serviceCommission, amount);
      } else {
        if (bookingAdjusted) {
          noteVisit(String(booking.id), "serviceRateAddonPay", split.pay);
        }
        result.serviceTierRevenue = addMoney(result.serviceTierRevenue, split.pay);
        result.serviceCommission = addMoney(
          result.serviceCommission,
          percentOf(split.pay, staffPaysAddon ? effectiveServiceRate : 0),
        );
      }
    }
    const adjusted =
      (retailByBooking.get(booking.id) || 0) > 0 || (addonByBooking.get(booking.id) || 0) > 0;
    if (adjusted && staffServices.length > 0) {
      noteVisit(
        String(booking.id),
        "calculatedCommission",
        subtractMoney(result.serviceCommission, serviceCommissionBeforeBooking),
      );
      result.serviceAdjustedBookingIds.push(String(booking.id));
      result.serviceCommissionOnAdjustedBookings = addMoney(
        result.serviceCommissionOnAdjustedBookings,
        subtractMoney(result.serviceCommission, serviceCommissionBeforeBooking),
      );
    }
  }

  for (const bp of bookingProducts) {
    const product = productMap.get((bp as any).product_id);
    const bookingForProduct = bookings.find((x: any) => x.id === (bp as any).booking_id);
    const servicesForProduct = ((bookingForProduct as any)?.booking_services ?? []).map(
      (svc: { staff_id?: string | null; price?: number }) => ({
        staffId: svc.staff_id ?? null,
        price: Number(svc.price || 0),
      }),
    );
    const split = appointmentProductPayAndStoredShare({
      paidAmount: paidByRow.get(bp) ?? 0,
      staffId,
      productStaffId: (bp as any).staff_id,
      services: servicesForProduct,
    });
    if (split.inStoredService <= 0 && split.pay <= 0) continue;
    if (
      split.inStoredService > 0 &&
      result.serviceAdjustedBookingIds.includes(String((bp as any).booking_id))
    ) {
      result.adjustedServiceExcludedRevenue = addMoney(
        result.adjustedServiceExcludedRevenue,
        split.inStoredService,
      );
      noteVisit(String((bp as any).booking_id), "excludedRevenue", split.inStoredService);
    }
    if (product?.team_member_commission_enabled === false || split.pay <= 0) continue;
    const staffPays = staff.commission_enabled !== false;
    if (product?.commission_rate_override != null) {
      const amount = percentOf(split.pay, staffPays ? product.commission_rate_override : 0);
      result.productOverrideCommission = addMoney(result.productOverrideCommission, amount);
      result.productOverrideRevenue = addMoney(result.productOverrideRevenue, split.pay);
      result.productCommission = addMoney(result.productCommission, amount);
    } else {
      result.productTierRevenue = addMoney(result.productTierRevenue, split.pay);
      result.productCommission = addMoney(
        result.productCommission,
        percentOf(split.pay, staffPays ? effectiveProductRate : 0),
      );
    }
  }

  for (const bookingId of result.serviceAdjustedBookingIds) {
    if (!adjustedVisit.has(bookingId)) {
      adjustedVisit.set(bookingId, {
        keptRevenue: 0,
        excludedRevenue: 0,
        ownRateAddonCommission: 0,
        serviceRateAddonPay: 0,
        calculatedCommission: 0,
      });
    }
  }
  result.adjustedVisits = [...adjustedVisit.entries()].map(([bookingId, row]) => ({
    bookingId,
    keptRevenue: row.keptRevenue,
    excludedRevenue: row.excludedRevenue,
    ownRateAddonCommission: row.ownRateAddonCommission,
    serviceRateAddonPay: row.serviceRateAddonPay,
    calculatedCommission: row.calculatedCommission,
  }));

  for (const item of saleItems || []) {
    const product = item.item_id ? productMap.get(item.item_id) : undefined;
    const split = splitProductCommissionLine({
      amount: Number(item.total_price || 0),
      commissionEnabled: product?.team_member_commission_enabled !== false,
      staffCommissionEnabled: staff.commission_enabled !== false,
      overrideRate:
        product?.commission_rate_override != null ? Number(product.commission_rate_override) : null,
      baseRate: effectiveProductRate,
    });
    result.productTierRevenue = addMoney(result.productTierRevenue, split.tierRevenue);
    result.productOverrideCommission = addMoney(result.productOverrideCommission, split.overrideCommission);
    if (split.overrideCommission !== 0) {
      result.productOverrideRevenue = addMoney(result.productOverrideRevenue, split.revenue);
    }
    result.productCommission = addMoney(result.productCommission, split.commission);
  }

  for (const line of walkInLines) {
    const product = line.product_id ? productMap.get(line.product_id) : undefined;
    if (product?.team_member_commission_enabled === false) continue;
    const staffPays = staff.commission_enabled !== false;
    if (line.realizedNet < 0) {
      const ownRate = product?.commission_rate_override != null;
      const rate = ownRate ? product?.commission_rate_override ?? 0 : baseProductRate;
      const amount = percentOf(line.realizedNet, staffPays ? rate : 0);
      result.returnCommission = addMoney(result.returnCommission, amount);
      if (!ownRate) {
        result.returnBaseProductRevenue = addMoney(result.returnBaseProductRevenue ?? 0, line.realizedNet);
        result.returnBaseProductCommission = addMoney(result.returnBaseProductCommission ?? 0, amount);
      }
      continue;
    }
    if (product?.commission_rate_override != null) {
      const amount = percentOf(line.realizedNet, staffPays ? product.commission_rate_override : 0);
      result.productOverrideCommission = addMoney(result.productOverrideCommission, amount);
      result.productOverrideRevenue = addMoney(result.productOverrideRevenue, line.realizedNet);
      result.productCommission = addMoney(result.productCommission, amount);
    } else {
      result.productTierRevenue = addMoney(result.productTierRevenue, line.realizedNet);
      result.productCommission = addMoney(
        result.productCommission,
        percentOf(line.realizedNet, staffPays ? effectiveProductRate : 0),
      );
    }
  }

  for (const line of posServiceLines) {
    const offering = line.offering_id ? offeringMap.get(line.offering_id) : undefined;
    const split = posServiceCommissionAmount({
      realizedNet: line.realizedNet,
      staffPays: staff.commission_enabled !== false,
      overrideRate:
        offering?.commission_rate_override != null ? Number(offering.commission_rate_override) : null,
      baseRate: baseServiceRate,
      tierRate: effectiveServiceRate,
    });
    result.serviceTierRevenue = addMoney(result.serviceTierRevenue, split.tierRevenue);
    result.serviceOverrideCommission = addMoney(result.serviceOverrideCommission, split.overrideCommission);
    result.serviceOverrideRevenue = addMoney(result.serviceOverrideRevenue, split.overrideRevenue);
    result.posServiceTierRevenue = addMoney(result.posServiceTierRevenue, split.tierRevenue);
    result.posServiceOverrideCommission = addMoney(result.posServiceOverrideCommission, split.overrideCommission);
    result.posServiceCommission = addMoney(result.posServiceCommission, split.commission);
    result.serviceCommission = addMoney(result.serviceCommission, split.commission);
    result.returnCommission = addMoney(result.returnCommission, split.returnCommission);
    if (line.realizedNet < 0 && offering?.commission_rate_override == null) {
      result.returnBaseServiceRevenue = addMoney(result.returnBaseServiceRevenue ?? 0, line.realizedNet);
      result.returnBaseServiceCommission = addMoney(
        result.returnBaseServiceCommission ?? 0,
        split.returnCommission,
      );
    }
  }

  result.totalCommission = sumMoney(
    result.serviceCommission,
    result.productCommission,
    result.returnCommission,
  );

  return result;
}

/**
 * Calculate commission for all staff of a provider in a date range.
 */
export async function calculateAllStaffCommissions(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromDate: Date,
  toDate: Date,
  staffIdFilter?: string,
  locationId?: string | null
): Promise<Map<string, CommissionResult>> {
  const results = new Map<string, CommissionResult>();

  let staffQuery = supabaseAdmin
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true);

  if (staffIdFilter) {
    staffQuery = staffQuery.eq("id", staffIdFilter);
  }

  const { data: staffMembers } = await staffQuery;

  if (!staffMembers) return results;

  for (const staff of staffMembers) {
    const commission = await calculateStaffCommission(
      supabaseAdmin,
      providerId,
      staff.id,
      fromDate,
      toDate,
      locationId
    );
    results.set(staff.id, commission);
  }

  return results;
}
