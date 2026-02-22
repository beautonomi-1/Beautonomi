/**
 * Operational State Logic for Front Desk
 * Derives display badges from booking status, current_stage, and time.
 */

import type { Booking } from "@/types/beautonomi";
import type { OperationalBadge } from "./types";

const LATE_THRESHOLD_MINUTES = 10;
const ARRIVING_WINDOW_MINUTES = 30;

/**
 * Get the operational badge for a booking.
 * Used for queue tabs and tile display.
 */
export function getOperationalBadge(booking: Booking): OperationalBadge {
  const status = (booking as any).status as string;
  const currentStage = (booking as any).current_stage as string | undefined;
  const scheduledAt = booking.scheduled_at;
  const now = new Date();
  const scheduled = new Date(scheduledAt);
  const minutesPastStart = (now.getTime() - scheduled.getTime()) / (60 * 1000);
  const minutesUntilStart = (scheduled.getTime() - now.getTime()) / (60 * 1000);
  const locationType = (booking as any).location_type as string | undefined;
  const paymentStatus = (booking as any).payment_status as string | undefined;
  const totalPaid = (booking as any).total_paid as number | undefined;
  const totalAmount = (booking as any).total_amount as number | undefined;

  // Terminal states
  if (status === "cancelled" || status === "no_show") return "cancelled";
  if (status === "completed") {
    const fullyPaid = paymentStatus === "paid" || (totalPaid != null && totalAmount != null && totalPaid >= totalAmount);
    return fullyPaid ? "completed" : "ready_to_pay";
  }

  // In service
  if (status === "in_progress" || currentStage === "service_started") {
    // Service done (current_stage service_completed) but not marked completed - could be ready to pay
    if (currentStage === "service_completed") {
      const fullyPaid = paymentStatus === "paid" || (totalPaid != null && totalAmount != null && totalPaid >= totalAmount);
      return fullyPaid ? "completed" : "ready_to_pay";
    }
    return "in_service";
  }

  // Ready to pay: completed status in DB but we already handled completed above.
  // Alternative: status confirmed/in_progress and service_completed stage but payment pending
  if (currentStage === "service_completed" && paymentStatus !== "paid") {
    return "ready_to_pay";
  }

  // Checked in / arrived
  if (currentStage === "client_arrived" && locationType !== "at_home") {
    return "checked_in";
  }
  if (currentStage === "provider_arrived" && locationType === "at_home") {
    return "checked_in";
  }

  // Upcoming: confirmed/pending
  if (minutesPastStart > LATE_THRESHOLD_MINUTES) {
    return "late";
  }
  if (minutesUntilStart <= ARRIVING_WINDOW_MINUTES && minutesUntilStart >= 0) {
    return "arriving";
  }
  if (minutesUntilStart < 0 && minutesPastStart <= LATE_THRESHOLD_MINUTES) {
    return "arriving"; // Just started, within grace
  }

  return "confirmed";
}

/**
 * Check if a booking belongs to a given queue tab.
 */
export function matchesQueueTab(
  booking: Booking,
  tabId: string
): boolean {
  const badge = getOperationalBadge(booking);

  switch (tabId) {
    case "all":
      return true;
    case "arrivals":
      return ["late", "arriving", "checked_in"].includes(badge);
    case "in_service":
      return badge === "in_service";
    case "ready_to_pay":
      return badge === "ready_to_pay";
    case "completed":
      return badge === "completed" || badge === "cancelled";
    default:
      return true;
  }
}

/**
 * Count bookings per queue for badge display.
 */
export function getQueueCounts(
  bookings: Booking[]
): Record<string, number> {
  const counts: Record<string, number> = {
    all: bookings.length,
    arrivals: 0,
    in_service: 0,
    ready_to_pay: 0,
    completed: 0,
  };

  for (const b of bookings) {
    const badge = getOperationalBadge(b);
    if (["late", "arriving", "checked_in"].includes(badge)) counts.arrivals++;
    else if (badge === "in_service") counts.in_service++;
    else if (badge === "ready_to_pay") counts.ready_to_pay++;
    else if (badge === "completed" || badge === "cancelled") counts.completed++;
  }

  return counts;
}
