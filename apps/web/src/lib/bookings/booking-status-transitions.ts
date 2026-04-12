import type { BookingStatus } from "@/lib/utils/booking-status";

/** DB statuses that cannot be left once reached (provider and admin guardrails). */
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  "completed",
  "cancelled",
  "no_show",
];

const ALL_BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
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
 */
export const PROVIDER_BOOKING_STATUS_TRANSITIONS: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled", "no_show"],
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
