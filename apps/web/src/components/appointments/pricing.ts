import type { AppointmentService, AppointmentProduct, PricingResult } from "./types";
import { calculateBookingTotals } from "@beautonomi/utils";

export interface PricingOptions {
  taxInclusive?: boolean;
}

/**
 * Shared pricing calculation for provider booking flows.
 * Wraps the canonical formula from @beautonomi/utils with the web-specific
 * AppointmentService/AppointmentProduct shapes.
 *
 * @param taxRate - fractional rate (e.g. 0.15 for 15%). Web passes the stored decimal;
 *   mobile should convert `taxRatePercent / 100` before calling.
 * @param options.taxInclusive - when true, tax is extracted from the
 *   after-discount amount rather than added on top (South African VAT-inclusive model).
 */
export function calculateBookingPricing(
  servicesList: AppointmentService[],
  productsList: AppointmentProduct[],
  travelFee: number,
  discountAmount: number,
  taxRate: number,
  serviceFeePercentage: number,
  tipAmount: number,
  options?: PricingOptions,
): PricingResult {
  const servicesSubtotal = servicesList.reduce((sum, s) => {
    const servicePrice = s.price;
    const addonsPrice = s.addons?.reduce((a, ad) => a + ad.price, 0) || 0;
    return sum + servicePrice + addonsPrice;
  }, 0);
  const productsSubtotal = productsList.reduce((sum, p) => sum + p.totalPrice, 0);
  const subtotal = servicesSubtotal + productsSubtotal;

  return calculateBookingTotals({
    subtotal,
    discountAmount,
    taxRate,
    taxInclusive: options?.taxInclusive ?? false,
    travelFee,
    serviceFeePercentage,
    tipAmount,
  });
}
