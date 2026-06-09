/**
 * Channel + revenue-stream taxonomy for provider/admin reporting.
 *
 * Channel signals:
 * - `bookings.booking_source` -> online | walk_in | provider
 * - `product_orders.order_source` -> online | walk_in | appointment
 *
 * Revenue streams are classified so liability/deferred flows are never summed into
 * recognized (payoutable) provider revenue.
 */

import { RECOGNIZED_REVENUE_TYPES } from "./provider-revenue-semantics";

export const BOOKING_CHANNELS = ["online", "walk_in", "provider"] as const;
export type BookingChannel = (typeof BOOKING_CHANNELS)[number];

export const ORDER_SOURCES = ["online", "walk_in", "appointment"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export type RevenueStreamCategory = "recognized" | "liability" | "platform" | "contra";

/** Ledger types that make up recognized (payoutable) provider revenue. */
export { RECOGNIZED_REVENUE_TYPES };

/** Deferred / liability ledger movements — not additive with recognized revenue. */
export const LIABILITY_REVENUE_TYPES = [
  "gift_card_sale",
  "gift_card_liability_reduction",
  "membership_sale",
  "wallet_topup",
] as const;

/** Provider pays platform — platform revenue, not provider earnings. */
export const PLATFORM_EXPENSE_TYPES = [
  "provider_subscription_payment",
  "provider_subscription_refund",
  "provider_ads_payment",
  "provider_ads_refund",
] as const;

/** Contra-revenue / discount ledger rows (negative net). */
export const CONTRA_REVENUE_TYPES = [
  "membership_discount",
  "promotion_discount",
  "loyalty_discount",
  "loyalty_redemption",
] as const;

const BOOKING_CHANNEL_SET = new Set<string>(BOOKING_CHANNELS);
const ORDER_SOURCE_SET = new Set<string>(ORDER_SOURCES);
const RECOGNIZED_SET = new Set<string>(RECOGNIZED_REVENUE_TYPES);
const LIABILITY_SET = new Set<string>(LIABILITY_REVENUE_TYPES);
const PLATFORM_SET = new Set<string>(PLATFORM_EXPENSE_TYPES);
const CONTRA_SET = new Set<string>(CONTRA_REVENUE_TYPES);

/**
 * Normalize booking channel. COALESCE(null,'online') matches commission trigger semantics.
 */
export function normalizeBookingChannel(src: string | null | undefined): BookingChannel | "unknown" {
  const normalized = String(src ?? "online").trim().toLowerCase();
  if (BOOKING_CHANNEL_SET.has(normalized)) return normalized as BookingChannel;
  return "unknown";
}

/** Normalize product order source. */
export function normalizeOrderSource(src: string | null | undefined): OrderSource | "unknown" {
  const normalized = String(src ?? "online").trim().toLowerCase();
  if (ORDER_SOURCE_SET.has(normalized)) return normalized as OrderSource;
  return "unknown";
}

/** Classify a ledger transaction_type into a reporting category. */
export function classifyRevenueStream(transactionType: string): RevenueStreamCategory | "other" {
  if (RECOGNIZED_SET.has(transactionType)) return "recognized";
  if (LIABILITY_SET.has(transactionType)) return "liability";
  if (PLATFORM_SET.has(transactionType)) return "platform";
  if (CONTRA_SET.has(transactionType)) return "contra";
  return "other";
}

export function isRecognizedRevenueType(transactionType: string): boolean {
  return RECOGNIZED_SET.has(transactionType);
}

export function isLiabilityRevenueType(transactionType: string): boolean {
  return LIABILITY_SET.has(transactionType);
}

export type BookingChannelBreakdownRow = {
  channel: BookingChannel | "unknown";
  count: number;
  recognized_revenue: number;
  percentage: number;
};

export type ComputeBookingChannelBreakdownInput = {
  bookings: ReadonlyArray<{ id: string; booking_source?: string | null }>;
  recognizedRevenueByBookingId: ReadonlyMap<string, number>;
};

/**
 * Aggregate booking counts and recognized revenue by channel.
 * Sum(channel.recognized_revenue) reconciles to sum of recognizedRevenueByBookingId values
 * for bookings in the input set.
 */
export function computeBookingChannelBreakdown(
  input: ComputeBookingChannelBreakdownInput,
): BookingChannelBreakdownRow[] {
  const { bookings, recognizedRevenueByBookingId } = input;
  const totalBookings = bookings.length;

  const channelCounts = new Map<BookingChannel | "unknown", number>();
  const channelRevenue = new Map<BookingChannel | "unknown", number>();

  for (const booking of bookings) {
    const channel = normalizeBookingChannel(booking.booking_source);
    channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
    const rev = recognizedRevenueByBookingId.get(booking.id) ?? 0;
    channelRevenue.set(channel, (channelRevenue.get(channel) ?? 0) + rev);
  }

  const channels = [...new Set([...channelCounts.keys(), ...channelRevenue.keys()])];

  return channels
    .map((channel) => ({
      channel,
      count: channelCounts.get(channel) ?? 0,
      recognized_revenue: channelRevenue.get(channel) ?? 0,
      percentage: totalBookings > 0 ? ((channelCounts.get(channel) ?? 0) / totalBookings) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export type OrderSourceBreakdownRow = {
  source: OrderSource;
  units: number;
  revenue: number;
};

export type ComputeOrderSourceBreakdownInput = {
  orders: ReadonlyArray<{
    order_source?: string | null;
    units?: number;
    revenue?: number;
  }>;
};

/**
 * Aggregate standalone retail product orders by order_source (online vs walk_in).
 * Appointment orders should be excluded by the caller to avoid double-counting booking revenue.
 */
export function computeOrderSourceBreakdown(
  input: ComputeOrderSourceBreakdownInput,
): { online: OrderSourceBreakdownRow; walk_in: OrderSourceBreakdownRow } {
  let onlineUnits = 0;
  let onlineRevenue = 0;
  let walkInUnits = 0;
  let walkInRevenue = 0;

  for (const order of input.orders) {
    const source = normalizeOrderSource(order.order_source);
    const units = Number(order.units ?? 0);
    const revenue = Number(order.revenue ?? 0);
    if (source === "walk_in") {
      walkInUnits += units;
      walkInRevenue += revenue;
    } else if (source === "online") {
      onlineUnits += units;
      onlineRevenue += revenue;
    }
  }

  return {
    online: { source: "online", units: onlineUnits, revenue: onlineRevenue },
    walk_in: { source: "walk_in", units: walkInUnits, revenue: walkInRevenue },
  };
}

/** Standard basis note for mixed scheduled-at counts vs settlement-date revenue. */
export const CHANNEL_BASIS_NOTE =
  "Booking counts use scheduled_at in the selected range. Channel revenue uses recognized ledger settlement (finance_transactions.created_at) and may be zero for walk-in/cash bookings without platform ledger rows.";
