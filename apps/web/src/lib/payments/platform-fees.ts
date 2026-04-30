/**
 * Platform Fee Calculation Utilities
 * 
 * These functions help calculate customer-paid Platform Fees and commissions
 * based on the platform settings configured by superadmin.
 */

import { percentOf, subtractMoney } from "@beautonomi/utils";

interface PlatformFeeSettings {
  platform_service_fee_type: "percentage" | "fixed";
  platform_service_fee_percentage: number;
  platform_service_fee_fixed: number;
  platform_commission_percentage: number;
  show_service_fee_to_customer: boolean;
}

/**
 * Calculate customer-paid Platform Fee.
 * @deprecated Use calculatePlatformFee instead
 */
export function calculatePlatformServiceFee(
  bookingSubtotal: number,
  settings: PlatformFeeSettings
): number {
  return calculatePlatformFee(bookingSubtotal, settings);
}

/**
 * Calculate customer-paid Platform Fee (customer-facing)
 */
export function calculatePlatformFee(
  bookingSubtotal: number,
  settings: PlatformFeeSettings
): number {
  if (!settings.show_service_fee_to_customer) {
    return 0;
  }

  if (settings.platform_service_fee_type === "percentage") {
    return percentOf(bookingSubtotal, settings.platform_service_fee_percentage);
  } else {
    return settings.platform_service_fee_fixed;
  }
}

/** @deprecated Use calculatePlatformFee. */
export const calculateServiceFee = calculatePlatformFee;

/**
 * Calculate platform commission (what platform takes from booking)
 * This is the revenue split between platform and provider.
 *
 * @deprecated Prefer the inline commission calculation in charge-success.ts which
 *   correctly derives the commission base from finance_transactions. If you use this
 *   helper, you MUST pass the commission base (services + addons + products − discounts),
 *   EXCLUDING tip, tax, travel fee, and customer-paid Platform Fee — never the full booking total.
 *
 * @param commissionBase The commission-eligible amount, NOT the booking total.
 */
export function calculatePlatformCommission(
  commissionBase: number,
  settings: PlatformFeeSettings
): {
  platformCommission: number;
  providerPayout: number;
} {
  const commissionPercentage = settings.platform_commission_percentage;
  const platformCommission = percentOf(commissionBase, commissionPercentage);
  const providerPayout = subtractMoney(commissionBase, platformCommission);

  return {
    platformCommission,
    providerPayout,
  };
}

/**
 * Calculate total amount with customer-paid Platform Fee
 */
export function calculateTotalWithPlatformFee(
  bookingSubtotal: number,
  settings: PlatformFeeSettings
): {
  subtotal: number;
  platformFee: number;
  /** @deprecated Use platformFee. */
  serviceFee: number;
  total: number;
} {
  const platformFee = calculatePlatformFee(bookingSubtotal, settings);
  const total = bookingSubtotal + platformFee;

  return {
    subtotal: bookingSubtotal,
    platformFee,
    serviceFee: platformFee,
    total,
  };
}

/** @deprecated Use calculateTotalWithPlatformFee. */
export const calculateTotalWithServiceFee = calculateTotalWithPlatformFee;

/**
 * Get platform fee settings from API
 */
export async function getPlatformFeeSettings(): Promise<PlatformFeeSettings | null> {
  try {
    const response = await fetch("/api/admin/settings");
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.data?.payouts || null;
  } catch (error) {
    console.error("Error fetching platform fee settings:", error);
    return null;
  }
}

/**
 * Get public platform fee settings (for checkout display)
 * This endpoint should be public and cached
 */
export async function getPublicPlatformFeeSettings(): Promise<PlatformFeeSettings | null> {
  try {
    const response = await fetch("/api/public/platform-fees");
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error("Error fetching public platform fee settings:", error);
    return null;
  }
}
