/**
 * Front Desk Domain Types
 * Maps to existing API response types - no parallel shapes.
 */

import type { Booking } from "@/types/beautonomi";

/** Re-export Booking - we use the existing type directly */
export type { Booking };

/** Operational state badge for queue display */
export type OperationalBadge =
  | "late"
  | "arriving"
  | "checked_in"
  | "in_service"
  | "ready_to_pay"
  | "completed"
  | "cancelled"
  | "confirmed";

/** Queue tab IDs matching the spec */
export type QueueTabId = "all" | "arrivals" | "in_service" | "ready_to_pay" | "completed";

/** Extended booking with operational state for front desk */
export interface FrontDeskBooking extends Booking {
  /** Operational badge derived from status + timing */
  operationalBadge?: OperationalBadge;
  /** Customer display name (from joined customers) */
  customer_name?: string;
  /** Staff display name (from first service) */
  staff_name?: string;
  /** Location name (from joined locations) */
  location_name?: string;
}
