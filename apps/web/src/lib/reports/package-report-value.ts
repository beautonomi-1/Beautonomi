import { percentOf } from "@beautonomi/utils";

/**
 * Package “booked value” for provider reports: excludes tips, travel, platform fees.
 * Uses catalog bundle price when set; otherwise net services value after %-discount packages.
 */
export function packageReportBookedValue(params: {
  catalogPrice: number | null | undefined;
  catalogDiscountPercent: number | null | undefined;
  /** Sum of `booking_services.price` for the booking (services-only component). */
  bookingServicesLineSum: number;
}): number {
  const lineSum = Math.max(0, Number(params.bookingServicesLineSum) || 0);
  const p = params.catalogPrice;
  if (p != null && p !== undefined && Number(p) > 0) {
    return Number(p);
  }
  const pct = params.catalogDiscountPercent;
  if (pct != null && Number(pct) > 0) {
    return Math.max(0, lineSum - percentOf(lineSum, Number(pct)));
  }
  return lineSum;
}
