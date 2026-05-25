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

/**
 * Statuses whose semantics are salon-specific (`checked_in` = physical arrival
 * to the salon waiting room; `waiting` = chair-side queue). At-home bookings
 * use `current_stage` (`provider_on_way`, `provider_arrived`) for journey
 * progression and should NEVER be moved into either of these statuses — doing
 * so dead-ends the journey flow because journey endpoints require `confirmed`.
 */
const SALON_ONLY_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "checked_in",
  "waiting",
]);

export function isSalonOnlyBookingStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return SALON_ONLY_BOOKING_STATUSES.has(status as BookingStatus);
}

export function isValidProviderBookingStatusTransition(
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  const allowed = PROVIDER_BOOKING_STATUS_TRANSITIONS[from as BookingStatus];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}

export function getAllowedProviderBookingStatusTargets(from: string): string[] {
  return [...(PROVIDER_BOOKING_STATUS_TRANSITIONS[from as BookingStatus] ?? [])];
}

/**
 * Validate a transition with location-type context. Adds two rules on top of
 * the base transition graph:
 *
 * 1. **Reject salon-only targets for at-home bookings.** A house-call provider
 *    cannot put a booking into `checked_in` or `waiting` — those have no
 *    semantic meaning for the at-home journey and would dead-end it.
 * 2. **Allow at-home recovery from a salon-only status to `confirmed`.** If a
 *    legacy at-home booking is already stuck in `checked_in` or `waiting`
 *    (because of older clients or admin error), the provider can roll it back
 *    to `confirmed` to re-engage the journey flow.
 */
export function isValidProviderBookingStatusTransitionWithContext(
  from: string,
  to: string,
  context: { locationType?: string | null } = {}
): boolean {
  if (from === to) return true;
  const isAtHome = context.locationType === "at_home";

  // Recovery edge: at-home + salon-only stuck → confirmed (not in the base table).
  if (isAtHome && isSalonOnlyBookingStatus(from) && to === "confirmed") {
    return true;
  }

  if (!isValidProviderBookingStatusTransition(from, to)) {
    return false;
  }

  // Block at-home from being PATCHed into salon-only statuses.
  if (isAtHome && isSalonOnlyBookingStatus(to)) {
    return false;
  }
  return true;
}

export function getProviderBookingStatusTransitionBlockReason(
  from: string,
  to: string,
  context: { payment_status?: string | null; locationType?: string | null } = {}
): string {
  const isAtHome = context.locationType === "at_home";
  if (isAtHome && isSalonOnlyBookingStatus(to)) {
    return `${to} is a salon-only status. House-call bookings progress via Start journey and Mark arrived — use those instead, or move directly to ${from === "confirmed" ? "in_progress (after arrival is verified)" : "the next house-call stage"}.`;
  }
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
    const filteredAllowed = isAtHome
      ? allowed.filter((s) => !isSalonOnlyBookingStatus(s))
      : allowed;
    return `Cannot change this booking from ${from} to ${to}. Allowed next statuses: ${filteredAllowed.join(", ")}.`;
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
