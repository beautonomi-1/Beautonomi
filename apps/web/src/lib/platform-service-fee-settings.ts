/**
 * Platform Service Fee Settings Helper
 * 
 * Provides utilities for getting the effective service fee based on:
 * 1. Provider's customer_fee_config_id (from platform_fee_config table)
 * 2. Platform default service fee (from platform_settings)
 * 3. Hardcoded fallback (10%)
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_SERVICE_FEE_PERCENTAGE = 10.00; // 10% fallback

export interface ServiceFeeConfig {
  percentage: number;
  fixedAmount?: number;
  feeType: "percentage" | "fixed_amount";
  minBookingAmount?: number;
  maxFeeAmount?: number;
}

/**
 * Get the effective service fee configuration for a provider
 * Priority: provider customer_fee_config_id → platform default → 10% fallback
 * 
 * @param providerId - Provider ID
 * @param subtotal - Booking subtotal (for checking min_booking_amount)
 * @returns Service fee configuration
 */
export async function getEffectiveServiceFeeConfig(
  providerId: string,
  subtotal: number = 0
): Promise<ServiceFeeConfig> {
  try {
    const supabaseAdmin = await getSupabaseAdmin();
    
    // Get provider's customer_fee_config_id
    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("customer_fee_config_id")
      .eq("id", providerId)
      .single();
    
    if (provider?.customer_fee_config_id) {
      const { data: feeConfig } = await supabaseAdmin
        .from("platform_fee_config")
        .select("fee_type, fee_percentage, fee_fixed_amount, min_booking_amount, max_fee_amount")
        .eq("id", provider.customer_fee_config_id)
        .eq("is_active", true)
        .single();
      
      if (feeConfig) {
        const minBookingAmount = Number(feeConfig.min_booking_amount || 0);
        
        // Only apply fee if booking meets minimum amount
        if (subtotal >= minBookingAmount) {
          if (feeConfig.fee_type === "percentage") {
            const percentage = Number(feeConfig.fee_percentage || 0);
            if (percentage > 0) {
              return {
                percentage,
                feeType: "percentage",
                minBookingAmount,
                maxFeeAmount: feeConfig.max_fee_amount ? Number(feeConfig.max_fee_amount) : undefined,
              };
            }
          } else if (feeConfig.fee_type === "fixed_amount") {
            const fixedAmount = Number(feeConfig.fee_fixed_amount || 0);
            if (fixedAmount > 0) {
              return {
                percentage: 0,
                fixedAmount,
                feeType: "fixed_amount",
                minBookingAmount,
              };
            }
          }
        }
      }
    }
    
    // Fallback to platform settings
    const { data: platformSettings } = await supabaseAdmin
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (platformSettings?.settings) {
      const payoutSettings = (platformSettings.settings as any)?.payouts || {};
      const serviceFeeType = payoutSettings.platform_service_fee_type || "percentage";
      const fallbackFeePercentage = payoutSettings.platform_service_fee_percentage || 0;
      const fallbackFeeFixed = payoutSettings.platform_service_fee_fixed || 0;
      
      if (serviceFeeType === "percentage" && fallbackFeePercentage > 0) {
        return {
          percentage: fallbackFeePercentage,
          feeType: "percentage",
        };
      } else if (serviceFeeType === "fixed_amount" && fallbackFeeFixed > 0) {
        return {
          percentage: 0,
          fixedAmount: fallbackFeeFixed,
          feeType: "fixed_amount",
        };
      }
    }
    
    // Fallback to hardcoded default
    return {
      percentage: DEFAULT_SERVICE_FEE_PERCENTAGE,
      feeType: "percentage",
    };
  } catch (error) {
    console.warn("Failed to get service fee config from database, using fallback:", error);
    return {
      percentage: DEFAULT_SERVICE_FEE_PERCENTAGE,
      feeType: "percentage",
    };
  }
}

/**
 * Calculate service fee amount based on configuration and subtotal
 * 
 * @param config - Service fee configuration
 * @param subtotal - Booking subtotal (after discounts)
 * @returns Service fee amount
 */
export function calculateServiceFeeAmount(
  config: ServiceFeeConfig,
  subtotal: number
): number {
  if (config.minBookingAmount && subtotal < config.minBookingAmount) {
    return 0;
  }
  
  if (config.feeType === "fixed_amount" && config.fixedAmount) {
    return config.fixedAmount;
  }
  
  if (config.feeType === "percentage" && config.percentage > 0) {
    let amount = (subtotal * config.percentage) / 100;
    
    // Apply max fee cap if set
    if (config.maxFeeAmount) {
      amount = Math.min(amount, config.maxFeeAmount);
    }
    
    return Number(amount.toFixed(2));
  }
  
  return 0;
}

/**
 * Get the platform default service fee percentage
 * @returns Service fee percentage (e.g., 10.00 for 10%)
 */
export async function getPlatformDefaultServiceFeePercentage(): Promise<number> {
  try {
    const supabaseAdmin = await getSupabaseAdmin();
    
    const { data: platformSettings } = await supabaseAdmin
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (platformSettings?.settings) {
      const payoutSettings = (platformSettings.settings as any)?.payouts || {};
      const serviceFeeType = payoutSettings.platform_service_fee_type || "percentage";
      const fallbackFeePercentage = payoutSettings.platform_service_fee_percentage || 0;
      
      if (serviceFeeType === "percentage" && fallbackFeePercentage > 0) {
        return fallbackFeePercentage;
      }
    }
    
    return DEFAULT_SERVICE_FEE_PERCENTAGE;
  } catch (error) {
    console.warn("Failed to get platform default service fee, using fallback:", error);
    return DEFAULT_SERVICE_FEE_PERCENTAGE;
  }
}
