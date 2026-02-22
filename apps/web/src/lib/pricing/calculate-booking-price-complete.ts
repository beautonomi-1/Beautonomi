/**
 * Complete Booking Price Calculator
 * 
 * Handles all financial components:
 * - Services, Products, Add-ons
 * - Member Discounts
 * - Loyalty Points
 * - Promo Codes
 * - Manual Discounts
 * - Taxes
 * - Travel Fees (Standard & Route-Chained)
 * - Platform Service Fees
 * - Tips
 */

export interface ServiceItem {
  id: string;
  price: number;
  tax_rate?: number;
}

export interface ProductItem {
  id: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface AddonItem {
  id: string;
  price: number;
  tax_rate?: number;
}

export interface MembershipInfo {
  id: string;
  name: string;
  discount_percentage: number;
  discount_type: 'percentage' | 'fixed_amount';
  discount_applies_to?: 'all_services' | 'specific_categories';
  member_since?: string;
}

export interface LoyaltyPointsInfo {
  available_balance: number;
  points_to_redeem: number;
  redemption_rate: number; // Points per currency unit discount
  min_redemption_points: number;
  max_redemption_percentage: number;
}

export interface PromotionInfo {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_booking_amount?: number;
}

export interface TravelFeeInfo {
  distance_km: number;
  method: 'standard' | 'route_chained';
  is_first_in_route?: boolean;
  previous_booking_location?: { lat: number; lng: number };
  base_fee?: number;
  per_km_rate?: number;
  free_radius_km?: number;
}

export interface PlatformFeeConfig {
  id: string;
  name: string;
  fee_type: 'percentage' | 'fixed_amount' | 'tiered';
  fee_percentage?: number;
  fee_fixed_amount?: number;
  tiered_config?: Array<{
    min_amount: number;
    max_amount: number | null;
    fee_percentage?: number;
    fee_fixed_amount?: number;
  }>;
  min_booking_amount?: number;
  max_fee_amount?: number;
}

export interface CalculateBookingPriceInput {
  // Items
  services: ServiceItem[];
  products?: ProductItem[];
  addons?: AddonItem[];
  
  // Discounts
  membership?: MembershipInfo | null;
  loyaltyPoints?: LoyaltyPointsInfo | null;
  promotion?: PromotionInfo | null;
  manualDiscount?: {
    amount: number;
    reason?: string;
  } | null;
  
  // Fees
  travelFee?: TravelFeeInfo | null;
  platformFeeConfig?: PlatformFeeConfig | null;
  
  // Optional
  tipPercentage?: number;
  currency?: string;
}

export interface PriceBreakdown {
  // Step 1: Base Subtotal
  services_subtotal: number;
  products_subtotal: number;
  addons_subtotal: number;
  base_subtotal: number;
  
  // Step 2: Member Discount
  membership: {
    name: string | null;
    discount_percentage: number;
    discount_amount: number;
    member_since?: string;
  };
  subtotal_after_membership: number;
  
  // Step 3: Loyalty Points
  loyalty_points: {
    available_balance: number;
    points_to_redeem: number;
    discount_amount: number;
    balance_after: number;
    conversion_rate: string;
    points_earned: number;
  };
  subtotal_after_loyalty: number;
  
  // Step 4: Promo Code
  promotion: {
    code: string | null;
    type: string | null;
    value: number;
    discount_amount: number;
  };
  subtotal_after_promo: number;
  
  // Step 5: Manual Discount
  manual_discount: {
    amount: number;
    reason: string | null;
  };
  taxable_amount: number;
  
  // Step 6: Tax
  tax: {
    rate: number;
    amount: number;
  };
  subtotal_with_tax: number;
  
  // Step 7: Travel Fee
  travel: {
    method: string;
    distance_km: number;
    standard_fee: number;
    optimized_fee: number;
    savings: number;
    is_first_in_route: boolean;
  };
  subtotal_with_travel: number;
  
  // Step 8: Platform Fee
  platform_fee: {
    config_name: string | null;
    type: string | null;
    rate: number;
    amount: number;
    applies_to: string;
  };
  subtotal_with_fee: number;
  
  // Step 9: Tip
  tip: {
    percentage: number;
    amount: number;
  };
  
  // Final
  total_amount: number;
  currency: string;
  
  // Summary
  total_savings: {
    membership: number;
    loyalty: number;
    promo: number;
    manual: number;
    travel_optimization: number;
    total: number;
  };
  
  // Metadata
  warnings: string[];
  suggestions: string[];
}

/**
 * Calculate complete booking price with all components
 */
export function calculateBookingPrice(input: CalculateBookingPriceInput): PriceBreakdown {
  const {
    services,
    products = [],
    addons = [],
    membership = null,
    loyaltyPoints = null,
    promotion = null,
    manualDiscount = null,
    travelFee = null,
    platformFeeConfig = null,
    tipPercentage = 0,
    currency = 'ZAR',
  } = input;

  const warnings: string[] = [];
  const suggestions: string[] = [];

  // STEP 1: Calculate Base Subtotal
  const services_subtotal = services.reduce((sum, s) => sum + s.price, 0);
  const products_subtotal = products.reduce((sum, p) => sum + (p.unit_price * p.quantity), 0);
  const addons_subtotal = addons.reduce((sum, a) => sum + a.price, 0);
  const base_subtotal = services_subtotal + products_subtotal + addons_subtotal;

  // STEP 2: Apply Member Discount
  let membership_discount_amount = 0;
  if (membership && membership.discount_percentage > 0) {
    if (membership.discount_type === 'percentage') {
      // Apply to services only (typically products excluded)
      membership_discount_amount = (services_subtotal + addons_subtotal) * (membership.discount_percentage / 100);
    } else {
      // Fixed amount discount
      membership_discount_amount = Math.min(membership.discount_percentage, services_subtotal + addons_subtotal);
    }
  }
  const subtotal_after_membership = base_subtotal - membership_discount_amount;

  // STEP 3: Apply Loyalty Points
  let loyalty_discount_amount = 0;
  let loyalty_points_redeemed = 0;
  let loyalty_balance_after = loyaltyPoints?.available_balance || 0;
  
  if (loyaltyPoints && loyaltyPoints.points_to_redeem > 0) {
    const min_points = loyaltyPoints.min_redemption_points || 50;
    const max_percentage = loyaltyPoints.max_redemption_percentage || 50;
    
    if (loyaltyPoints.points_to_redeem >= min_points) {
      if (loyaltyPoints.points_to_redeem <= loyaltyPoints.available_balance) {
        // Calculate discount from points
        loyalty_discount_amount = loyaltyPoints.points_to_redeem / loyaltyPoints.redemption_rate;
        
        // Check max redemption limit (% of subtotal)
        const max_loyalty_discount = subtotal_after_membership * (max_percentage / 100);
        if (loyalty_discount_amount > max_loyalty_discount) {
          loyalty_discount_amount = max_loyalty_discount;
          loyalty_points_redeemed = Math.floor(max_loyalty_discount * loyaltyPoints.redemption_rate);
          warnings.push(`Points capped at ${max_percentage}% of subtotal`);
        } else {
          loyalty_points_redeemed = loyaltyPoints.points_to_redeem;
        }
        
        loyalty_balance_after = loyaltyPoints.available_balance - loyalty_points_redeemed;
      } else {
        warnings.push('Insufficient points balance');
      }
    } else {
      warnings.push(`Minimum ${min_points} points required for redemption`);
    }
  }
  const subtotal_after_loyalty = subtotal_after_membership - loyalty_discount_amount;

  // STEP 4: Apply Promo Code
  let promo_discount_amount = 0;
  if (promotion) {
    if (promotion.min_booking_amount && subtotal_after_loyalty < promotion.min_booking_amount) {
      warnings.push(`Promo requires minimum booking of ${currency} ${promotion.min_booking_amount}`);
    } else {
      if (promotion.discount_type === 'percentage') {
        promo_discount_amount = subtotal_after_loyalty * (promotion.discount_value / 100);
      } else {
        promo_discount_amount = Math.min(promotion.discount_value, subtotal_after_loyalty);
      }
    }
  }
  const subtotal_after_promo = subtotal_after_loyalty - promo_discount_amount;

  // STEP 5: Apply Manual Discount
  const manual_discount_amount = Math.min(manualDiscount?.amount || 0, subtotal_after_promo);
  const taxable_amount = subtotal_after_promo - manual_discount_amount;

  // STEP 6: Calculate Tax
  let total_tax_rate = 0;
  let taxable_items_count = 0;
  
  [...services, ...products, ...addons].forEach((item: any) => {
    if (item.tax_rate && item.tax_rate > 0) {
      total_tax_rate += item.tax_rate;
      taxable_items_count++;
    }
  });
  
  const effective_tax_rate = taxable_items_count > 0 ? total_tax_rate / taxable_items_count : 0;
  const tax_amount = taxable_amount * (effective_tax_rate / 100);
  const subtotal_with_tax = taxable_amount + tax_amount;

  // STEP 7: Calculate Travel Fee
  let travel_fee_amount = 0;
  let standard_travel_fee = 0;
  let travel_savings = 0;
  
  if (travelFee && travelFee.distance_km > 0) {
    const base_fee = travelFee.base_fee || 20;
    const per_km_rate = travelFee.per_km_rate || 5;
    const free_radius = travelFee.free_radius_km || 5;
    
    // Calculate standard fee (from salon)
    if (travelFee.distance_km > free_radius) {
      const chargeable_distance = travelFee.distance_km - free_radius;
      standard_travel_fee = base_fee + (chargeable_distance * per_km_rate);
    }
    
    // Calculate actual fee based on method
    if (travelFee.method === 'route_chained' && !travelFee.is_first_in_route) {
      // Chained: only charge per-km rate (no base fee)
      if (travelFee.distance_km > free_radius) {
        travel_fee_amount = (travelFee.distance_km - free_radius) * per_km_rate;
      }
    } else {
      // Standard or first in route: full fee
      travel_fee_amount = standard_travel_fee;
    }
    
    travel_savings = standard_travel_fee - travel_fee_amount;
  }
  const subtotal_with_travel = subtotal_with_tax + travel_fee_amount;

  // STEP 8: Calculate Platform Fee
  let platform_fee_amount = 0;
  if (platformFeeConfig) {
    const fee_base = taxable_amount; // Apply fee to taxable amount
    
    if (!platformFeeConfig.min_booking_amount || fee_base >= platformFeeConfig.min_booking_amount) {
      if (platformFeeConfig.fee_type === 'percentage' && platformFeeConfig.fee_percentage) {
        platform_fee_amount = fee_base * (platformFeeConfig.fee_percentage / 100);
      } else if (platformFeeConfig.fee_type === 'fixed_amount' && platformFeeConfig.fee_fixed_amount) {
        platform_fee_amount = platformFeeConfig.fee_fixed_amount;
      } else if (platformFeeConfig.fee_type === 'tiered' && platformFeeConfig.tiered_config) {
        const tier = platformFeeConfig.tiered_config.find(
          t => fee_base >= t.min_amount && (t.max_amount === null || fee_base <= t.max_amount)
        );
        if (tier) {
          if (tier.fee_percentage) {
            platform_fee_amount = fee_base * (tier.fee_percentage / 100);
          } else if (tier.fee_fixed_amount) {
            platform_fee_amount = tier.fee_fixed_amount;
          }
        }
      }
      
      // Apply max cap
      if (platformFeeConfig.max_fee_amount) {
        platform_fee_amount = Math.min(platform_fee_amount, platformFeeConfig.max_fee_amount);
      }
    }
  }
  const subtotal_with_fee = subtotal_with_travel + platform_fee_amount;

  // STEP 9: Calculate Tip
  const tip_amount = tipPercentage > 0 ? (taxable_amount * (tipPercentage / 100)) : 0;
  
  // FINAL TOTAL
  const total_amount = subtotal_with_fee + tip_amount;

  // Calculate points earned (1 point per currency unit spent on taxable amount)
  const points_earned = Math.floor(taxable_amount);

  // Calculate total savings
  const total_savings = {
    membership: membership_discount_amount,
    loyalty: loyalty_discount_amount,
    promo: promo_discount_amount,
    manual: manual_discount_amount,
    travel_optimization: travel_savings,
    total: membership_discount_amount + loyalty_discount_amount + promo_discount_amount + manual_discount_amount + travel_savings,
  };

  // Add suggestions
  if (membership && membership.discount_percentage < 15) {
    suggestions.push('Upgrade to Platinum for 15% discount');
  }
  if (loyaltyPoints && loyalty_balance_after < 100) {
    suggestions.push(`Earn ${100 - loyalty_balance_after} more points to redeem`);
  }

  return {
    // Step 1
    services_subtotal,
    products_subtotal,
    addons_subtotal,
    base_subtotal,
    
    // Step 2
    membership: {
      name: membership?.name || null,
      discount_percentage: membership?.discount_percentage || 0,
      discount_amount: membership_discount_amount,
      member_since: membership?.member_since,
    },
    subtotal_after_membership,
    
    // Step 3
    loyalty_points: {
      available_balance: loyaltyPoints?.available_balance || 0,
      points_to_redeem: loyalty_points_redeemed,
      discount_amount: loyalty_discount_amount,
      balance_after: loyalty_balance_after,
      conversion_rate: `${loyaltyPoints?.redemption_rate || 10} points = ${currency} 1`,
      points_earned,
    },
    subtotal_after_loyalty,
    
    // Step 4
    promotion: {
      code: promotion?.code || null,
      type: promotion?.discount_type || null,
      value: promotion?.discount_value || 0,
      discount_amount: promo_discount_amount,
    },
    subtotal_after_promo,
    
    // Step 5
    manual_discount: {
      amount: manual_discount_amount,
      reason: manualDiscount?.reason || null,
    },
    taxable_amount,
    
    // Step 6
    tax: {
      rate: effective_tax_rate,
      amount: tax_amount,
    },
    subtotal_with_tax,
    
    // Step 7
    travel: {
      method: travelFee?.method || 'standard',
      distance_km: travelFee?.distance_km || 0,
      standard_fee: standard_travel_fee,
      optimized_fee: travel_fee_amount,
      savings: travel_savings,
      is_first_in_route: travelFee?.is_first_in_route || false,
    },
    subtotal_with_travel,
    
    // Step 8
    platform_fee: {
      config_name: platformFeeConfig?.name || null,
      type: platformFeeConfig?.fee_type || null,
      rate: platformFeeConfig?.fee_percentage || 0,
      amount: platform_fee_amount,
      applies_to: 'customer',
    },
    subtotal_with_fee,
    
    // Step 9
    tip: {
      percentage: tipPercentage,
      amount: tip_amount,
    },
    
    // Final
    total_amount,
    currency,
    
    // Summary
    total_savings,
    
    // Metadata
    warnings,
    suggestions,
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'ZAR'): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Validate loyalty points redemption
 */
export function validateLoyaltyRedemption(
  pointsToRedeem: number,
  availableBalance: number,
  minPoints: number,
  subtotal: number,
  maxPercentage: number
): { valid: boolean; error?: string; maxAllowed?: number } {
  if (pointsToRedeem < minPoints) {
    return { valid: false, error: `Minimum ${minPoints} points required` };
  }
  
  if (pointsToRedeem > availableBalance) {
    return { valid: false, error: 'Insufficient points balance' };
  }
  
  const maxAllowedPoints = Math.floor((subtotal * (maxPercentage / 100)) * 10); // Assuming 10 points per unit
  if (pointsToRedeem > maxAllowedPoints) {
    return { valid: false, error: `Maximum ${maxPercentage}% of subtotal can be paid with points`, maxAllowed: maxAllowedPoints };
  }
  
  return { valid: true };
}
