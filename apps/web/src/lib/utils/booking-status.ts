/**
 * Centralized Booking Status Mapping
 * 
 * This file ensures consistent booking status handling across all portals:
 * - Customer Portal
 * - Provider Portal  
 * - Superadmin Portal
 * 
 * Database Status Values (must be kept in sync with supabase public.booking_status enum):
 * - pending: Booking created but not confirmed
 * - pending_payment: Booking reserved, waiting for payment confirmation (webhook / redirect)
 * - confirmed: Booking confirmed and scheduled
 * - in_progress: Service has started
 * - completed: Service completed successfully
 * - cancelled: Booking was cancelled
 * - no_show: Customer didn't show up
 * - waiting / checked_in: lifecycle micro-states inside the provider portal
 */

export type BookingStatus =
  | "pending"
  | "pending_payment"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "waiting"
  | "checked_in";

/**
 * Source of truth: every literal that can appear in bookings.status must be in this list.
 * Used by the enum-contract test in __tests__/lib/booking-status-enum-contract.test.ts
 * to guard against drift between application code and the Postgres enum.
 */
export const ALL_BOOKING_STATUS_VALUES = [
  "pending",
  "pending_payment",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "waiting",
  "checked_in",
] as const satisfies readonly BookingStatus[];

/**
 * Customer Portal Status Mapping
 * Customer portal uses simplified statuses for better UX
 */
export type CustomerBookingStatus = "upcoming" | "past" | "cancelled";

/**
 * Provider Portal Status Mapping
 * Provider portal uses business-focused statuses
 */
export type ProviderBookingStatus =
  | "pending"
  | "booked"
  | "started"
  | "completed"
  | "cancelled"
  | "no_show";

/**
 * Map database status to customer portal status
 */
export function mapStatusToCustomer(dbStatus: BookingStatus, scheduledAt: string): CustomerBookingStatus {
  const now = new Date();
  const scheduled = new Date(scheduledAt);

  if (dbStatus === "cancelled") {
    return "cancelled";
  }

  if (dbStatus === "no_show") {
    return "past";
  }

  // Active appointment — always treat as upcoming for tabs/labels even if start time has passed.
  if (dbStatus === "in_progress") {
    return "upcoming";
  }

  // Past: completed, or not yet started but the slot time has passed
  if (dbStatus === "completed" || scheduled < now) {
    return "past";
  }

  return "upcoming";
}

/**
 * Map customer portal status to database statuses
 */
export function mapStatusFromCustomer(customerStatus: CustomerBookingStatus): BookingStatus[] {
  switch (customerStatus) {
    case "upcoming":
      return ["pending", "pending_payment", "confirmed", "in_progress", "waiting", "checked_in"];
    case "past":
      return ["completed"];
    case "cancelled":
      return ["cancelled"];
    default:
      return [];
  }
}

/**
 * Map database status to provider portal status
 */
export function mapStatusToProvider(dbStatus: BookingStatus): ProviderBookingStatus {
  const mapping: Record<BookingStatus, ProviderBookingStatus> = {
    pending: "pending",
    pending_payment: "pending",
    confirmed: "booked",
    in_progress: "started",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no_show",
    waiting: "booked",
    checked_in: "booked",
  };
  return mapping[dbStatus] || "booked";
}

/**
 * Map provider portal status to database status
 */
export function mapStatusFromProvider(providerStatus: ProviderBookingStatus | string): BookingStatus {
  const mapping: Record<string, BookingStatus> = {
    pending: "pending",
    booked: "confirmed",
    confirmed: "confirmed",
    started: "in_progress",
    in_progress: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no_show",
    /** Salon waiting-room / check-in micro-states (PATCH body uses same strings as DB). */
    waiting: "waiting",
    checked_in: "checked_in",
  };
  const mapped = mapping[providerStatus];
  if (!mapped) {
    throw new Error(`Unknown provider booking status: "${providerStatus}"`);
  }
  return mapped;
}

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: BookingStatus): string {
  const labels: Record<BookingStatus, string> = {
    pending: "Pending",
    pending_payment: "Awaiting Payment",
    confirmed: "Confirmed",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
    waiting: "Waiting",
    checked_in: "Checked In",
  };
  return labels[status] || status;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: BookingStatus): string {
  const colors: Record<BookingStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    pending_payment: "bg-yellow-200 text-yellow-900",
    confirmed: "bg-blue-100 text-blue-800",
    in_progress: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    no_show: "bg-orange-100 text-orange-800",
    waiting: "bg-amber-100 text-amber-800",
    checked_in: "bg-teal-100 text-teal-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

/**
 * Check if status allows cancellation
 */
export function canCancel(status: BookingStatus): boolean {
  return ["pending", "pending_payment", "confirmed"].includes(status);
}

/**
 * Check if status allows rescheduling.
 *
 * `pending_payment` is the transient state the customer enters during the
 * Paystack redirect; until payment clears we cannot reschedule (nothing has
 * been promised to the provider yet, and we'd have to release any held slot
 * the gateway is in the middle of charging against). Callers that have
 * confirmed payment (e.g. `payment_status = paid`) should treat the booking
 * as `pending` first via `resolveEffectiveBookingLifecycleStatus`.
 */
export function canReschedule(status: BookingStatus): boolean {
  return ["pending", "confirmed"].includes(status);
}

/**
 * Check if status is active (not completed/cancelled)
 */
export function isActiveStatus(status: BookingStatus): boolean {
  return !["completed", "cancelled", "no_show"].includes(status);
}
