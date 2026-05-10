import type { BookingStatus } from "@/lib/utils/booking-status";

/** DB statuses that cannot be left once reached (provider and admin guardrails). */
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  "completed",
  "cancelled",
  "no_show",
];

const ALL_BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "pending_payment",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "waiting",
  "checked_in",
];

/**
 * Allowed booking status transitions for provider PATCH (strict lifecycle).
 * Keys and values are database `bookings.status` values.
 *
 * `pending_payment` (P3 audit 2026-04) is a customer-payment lifecycle state:
 * the payment webhook / cron is what flips it to `confirmed` or `cancelled`.
 * A provider should NOT be able to manually force-advance a booking whose
 * payment hasn't cleared — but cancelling a stuck-in-pending_payment booking
 * is a legitimate cleanup path, so it remains allowed.
 */
export const PROVIDER_BOOKING_STATUS_TRANSITIONS: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  pending: ["confirmed", "checked_in", "cancelled"],
  pending_payment: ["cancelled"],
  /** Salon check-in: `checked_in` is physical arrival (waiting room); `in_progress` is chair time. */
  confirmed: ["checked_in", "in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
  waiting: ["checked_in", "in_progress", "cancelled"],
  checked_in: ["in_progress", "cancelled"],
};

export function isValidProviderBookingStatusTransition(
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  const allowed = PROVIDER_BOOKING_STATUS_TRANSITIONS[from as BookingStatus];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}

export function getProviderBookingStatusTransitionBlockReason(
  from: string,
  to: string,
  context: { payment_status?: string | null } = {}
): string {
  if (TERMINAL_BOOKING_STATUSES.includes(from as BookingStatus)) {
    return `${from} bookings are final and cannot be changed.`;
  }
  if (from === "pending_payment") {
    const paidNote =
      context.payment_status === "paid"
        ? " Payment status is settled, but this booking is still recorded as pending payment; refresh or contact support if this looks stale."
        : "";
    return `This booking is waiting for payment verification and can only be cancelled until payment clears.${paidNote}`;
  }
  const allowed = PROVIDER_BOOKING_STATUS_TRANSITIONS[from as BookingStatus] ?? [];
  if (allowed.length > 0) {
    return `Cannot change this booking from ${from} to ${to}. Allowed next statuses: ${allowed.join(", ")}.`;
  }
  return `Cannot change this booking from ${from} to ${to}.`;
}

/**
 * Admin may set any valid status from non-terminal states (e.g. correct mistakes,
 * force completion). Transitions from terminal states are blocked except no-op (from === to).
 */
export function isValidAdminBookingStatusTransition(
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  if (TERMINAL_BOOKING_STATUSES.includes(from as BookingStatus)) return false;
  return ALL_BOOKING_STATUSES.includes(to as BookingStatus);
}
