import type { Booking } from "@/types/beautonomi";

/** Booking as returned from list API (may include display names). */
export type ProviderBookingListItem = Booking & {
  customer_name?: string;
  location_name?: string;
  staff_name?: string;
};
