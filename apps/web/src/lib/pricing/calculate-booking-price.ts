/**
 * Comprehensive booking price calculation utility
 * Handles all pricing components: services, products, add-ons, discounts, taxes, fees
 */

export interface PricingItem {
  price: number;
  quantity?: number;
  taxable?: boolean;
}

export interface PricingInput {
  services: PricingItem[];
  products?: PricingItem[];
  addons?: PricingItem[];
  travelFee?: number;
  tipAmount?: number;
  discountAmount?: number;
  discountPercentage?: number;
  promoDiscount?: number;
  taxRate?: number; // As decimal (e.g., 0.15 for 15%)
  serviceFeePercentage?: number; // As decimal (e.g., 0.10 for 10%)
  serviceFeeFixedAmount?: number;
  serviceFeeAppliesAfterTax?: boolean;
}

export interface PricingBreakdown {
  // Subtotals
  servicesSubtotal: number;
  productsSubtotal: number;
  addonsSubtotal: number;
  subtotal: number;
  
  // Discounts
  manualDiscount: number;
  promoDiscount: number;
  totalDiscount: number;
  subtotalAfterDiscount: number;
  
  // Tax
  taxableAmount: number;
  taxAmount: number;
  
  // Fees
  travelFee: number;
  serviceFeeAmount: number;
  tipAmount: number;
  
  // Totals
  totalBeforeServiceFee: number;
  totalAmount: number;
  
  // Breakdown for display
  items: {
    label: string;
    amount: number;
    type: 'subtotal' | 'discount' | 'tax' | 'fee' | 'total';
  }[];
}

/**
 * Calculate comprehensive booking pricing
 */
export function calculateBookingPrice(input: PricingInput): PricingBreakdown {
  // Step 1: Calculate subtotals
  const servicesSubtotal = input.services.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0
  );
  
  const productsSubtotal = (input.products || []).reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0
  );
  
  const addonsSubtotal = (input.addons || []).reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0
  );
  
  const subtotal = servicesSubtotal + productsSubtotal + addonsSubtotal;
  
  // Step 2: Apply discounts
  let manualDiscount = input.discountAmount || 0;
  if (input.discountPercentage && input.discountPercentage > 0) {
    manualDiscount = Math.max(manualDiscount, (subtotal * input.discountPercentage) / 100);
  }
  
  const promoDiscount = input.promoDiscount || 0;
  const totalDiscount = manualDiscount + promoDiscount;
  
  // Cap discount at subtotal
  const cappedDiscount = Math.min(totalDiscount, subtotal);
  const subtotalAfterDiscount = Math.max(0, subtotal - cappedDiscount);
  
  // Step 3: Calculate tax (on discounted amount, only on taxable items)
  const taxableAmount = subtotalAfterDiscount; // Simplified: assume all items are taxable
  const taxRate = input.taxRate || 0;
  const taxAmount = taxableAmount * taxRate;
  
  // Step 4: Add travel fee and tip
  const travelFee = input.travelFee || 0;
  const tipAmount = input.tipAmount || 0;
  
  // Step 5: Calculate total before service fee
  const totalBeforeServiceFee = subtotalAfterDiscount + taxAmount + travelFee + tipAmount;
  
  // Step 6: Calculate service fee
  let serviceFeeAmount = 0;
  
  if (input.serviceFeeFixedAmount) {
    serviceFeeAmount = input.serviceFeeFixedAmount;
  } else if (input.serviceFeePercentage) {
    // Service fee can be calculated on amount before or after tax
    const serviceFeeBase = input.serviceFeeAppliesAfterTax
      ? (subtotalAfterDiscount + taxAmount)
      : subtotalAfterDiscount;
    serviceFeeAmount = serviceFeeBase * input.serviceFeePercentage;
  }
  
  // Step 7: Calculate final total
  const totalAmount = totalBeforeServiceFee + serviceFeeAmount;
  
  // Build breakdown for display
  const items: PricingBreakdown['items'] = [];
  
  items.push({
    label: 'Subtotal',
    amount: subtotal,
    type: 'subtotal',
  });
  
  if (cappedDiscount > 0) {
    items.push({
      label: 'Discount',
      amount: -cappedDiscount,
      type: 'discount',
    });
  }
  
  if (taxAmount > 0) {
    items.push({
      label: `Tax (${((taxRate || 0) * 100).toFixed(1)}%)`,
      amount: taxAmount,
      type: 'tax',
    });
  }
  
  if (travelFee > 0) {
    items.push({
      label: 'Travel Fee',
      amount: travelFee,
      type: 'fee',
    });
  }
  
  if (serviceFeeAmount > 0) {
    items.push({
      label: 'Service Fee',
      amount: serviceFeeAmount,
      type: 'fee',
    });
  }
  
  if (tipAmount > 0) {
    items.push({
      label: 'Tip',
      amount: tipAmount,
      type: 'fee',
    });
  }
  
  items.push({
    label: 'Total',
    amount: totalAmount,
    type: 'total',
  });
  
  return {
    servicesSubtotal,
    productsSubtotal,
    addonsSubtotal,
    subtotal,
    manualDiscount,
    promoDiscount,
    totalDiscount: cappedDiscount,
    subtotalAfterDiscount,
    taxableAmount,
    taxAmount,
    travelFee,
    serviceFeeAmount,
    tipAmount,
    totalBeforeServiceFee,
    totalAmount,
    items,
  };
}

/**
 * Calculate service fee based on configuration
 */
export function calculateServiceFee(
  baseAmount: number,
  config: {
    fee_type: 'percentage' | 'fixed_amount' | 'tiered';
    fee_percentage?: number;
    fee_fixed_amount?: number;
    tier_thresholds?: Array<{ max: number; percentage: number }>;
    max_fee_amount?: number;
  }
): number {
  let fee = 0;
  
  switch (config.fee_type) {
    case 'fixed_amount':
      fee = config.fee_fixed_amount || 0;
      break;
      
    case 'percentage':
      fee = baseAmount * ((config.fee_percentage || 0) / 100);
      break;
      
    case 'tiered':
      if (config.tier_thresholds && config.tier_thresholds.length > 0) {
        // Find applicable tier
        const tier = config.tier_thresholds.find(t => baseAmount <= t.max);
        if (tier) {
          fee = baseAmount * (tier.percentage / 100);
        } else {
          // Use last tier if amount exceeds all thresholds
          const lastTier = config.tier_thresholds[config.tier_thresholds.length - 1];
          fee = baseAmount * (lastTier.percentage / 100);
        }
      }
      break;
  }
  
  // Apply max cap if specified
  if (config.max_fee_amount && fee > config.max_fee_amount) {
    fee = config.max_fee_amount;
  }
  
  return Math.max(0, fee);
}
