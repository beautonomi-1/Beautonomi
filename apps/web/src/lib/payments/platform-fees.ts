/**
 * Platform Fee Calculation Utilities
 * 
 * These functions help calculate customer service fees and commissions
 * based on the platform settings configured by superadmin.
 */

interface PlatformFeeSettings {
  platform_service_fee_type: "percentage" | "fixed";
  platform_service_fee_percentage: number;
  platform_service_fee_fixed: number;
  platform_commission_percentage: number;
  show_service_fee_to_customer: boolean;
}

/**
 * Calculate customer service fee (customer-facing)
 * This is the fee shown to customers during checkout
 * @deprecated Use calculateServiceFee instead
 */
export function calculatePlatformServiceFee(
  bookingSubtotal: number,
  settings: PlatformFeeSettings
): number {
  return calculateServiceFee(bookingSubtotal, settings);
}

/**
 * Calculate customer service fee (customer-facing)
 * This is the fee shown to customers during checkout
 */
export function calculateServiceFee(
  bookingSubtotal: number,
  settings: PlatformFeeSettings
): number {
  if (!settings.show_service_fee_to_customer) {
    return 0;
  }

  if (settings.platform_service_fee_type === "percentage") {
    return (bookingSubtotal * settings.platform_service_fee_percentage) / 100;
  } else {
    return settings.platform_service_fee_fixed;
  }
}

/**
 * Calculate platform commission (what platform takes from booking)
 * This is the revenue split between platform and provider
 */
export function calculatePlatformCommission(
  bookingTotal: number,
  settings: PlatformFeeSettings
): {
  platformCommission: number;
  providerPayout: number;
} {
  const commissionPercentage = settings.platform_commission_percentage;
  const platformCommission = (bookingTotal * commissionPercentage) / 100;
  const providerPayout = bookingTotal - platformCommission;

  return {
    platformCommission,
    providerPayout,
  };
}

/**
 * Calculate total amount with customer service fee
 */
export function calculateTotalWithServiceFee(
  bookingSubtotal: number,
  settings: PlatformFeeSettings
): {
  subtotal: number;
  serviceFee: number;
  total: number;
} {
  const serviceFee = calculateServiceFee(bookingSubtotal, settings);
  const total = bookingSubtotal + serviceFee;

  return {
    subtotal: bookingSubtotal,
    serviceFee,
    total,
  };
}

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
