import type { Booking } from "@/types/beautonomi";

/** Booking as returned from list API (may include display names). */
export type ProviderBookingListItem = Booking & {
  customer_name?: string;
  customer_identity_verified?: boolean | null;
  location_name?: string;
  staff_name?: string;
};
