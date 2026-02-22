/**
 * Centralized Booking Status Mapping
 * 
 * This file ensures consistent booking status handling across all portals:
 * - Customer Portal
 * - Provider Portal  
 * - Superadmin Portal
 * 
 * Database Status Values:
 * - pending: Booking created but not confirmed
 * - confirmed: Booking confirmed and scheduled
 * - in_progress: Service has started
 * - completed: Service completed successfully
 * - cancelled: Booking was cancelled
 * - no_show: Customer didn't show up
 */

export type BookingStatus = 
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

/**
 * Customer Portal Status Mapping
 * Customer portal uses simplified statuses for better UX
 */
export type CustomerBookingStatus = "upcoming" | "past" | "cancelled";

/**
 * Provider Portal Status Mapping
 * Provider portal uses business-focused statuses
 */
export type ProviderBookingStatus = "booked" | "started" | "completed" | "cancelled" | "no_show";

/**
 * Map database status to customer portal status
 */
export function mapStatusToCustomer(dbStatus: BookingStatus, scheduledAt: string): CustomerBookingStatus {
  const now = new Date();
  const scheduled = new Date(scheduledAt);

  if (dbStatus === "cancelled") {
    return "cancelled";
  }

  // Past: completed or scheduled in the past
  if (dbStatus === "completed" || scheduled < now) {
    return "past";
  }

  // Upcoming: pending, confirmed, or in_progress scheduled in the future
  return "upcoming";
}

/**
 * Map customer portal status to database statuses
 */
export function mapStatusFromCustomer(customerStatus: CustomerBookingStatus): BookingStatus[] {
  switch (customerStatus) {
    case "upcoming":
      return ["pending", "confirmed", "in_progress"];
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
    pending: "booked",
    confirmed: "booked",
    in_progress: "started",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no_show",
  };
  return mapping[dbStatus] || "booked";
}

/**
 * Map provider portal status to database status
 */
export function mapStatusFromProvider(providerStatus: ProviderBookingStatus): BookingStatus {
  const mapping: Record<ProviderBookingStatus, BookingStatus> = {
    booked: "confirmed",
    started: "in_progress",
    completed: "completed",
    cancelled: "cancelled",
    no_show: "no_show",
  };
  return mapping[providerStatus] || "confirmed";
}

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: BookingStatus): string {
  const labels: Record<BookingStatus, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
  };
  return labels[status] || status;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: BookingStatus): string {
  const colors: Record<BookingStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    in_progress: "bg-purple-100 text-purple-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    no_show: "bg-orange-100 text-orange-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

/**
 * Check if status allows cancellation
 */
export function canCancel(status: BookingStatus): boolean {
  return ["pending", "confirmed"].includes(status);
}

/**
 * Check if status allows rescheduling
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
