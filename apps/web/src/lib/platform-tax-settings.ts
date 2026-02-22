/**
 * Platform Tax Settings Helper
 * 
 * Provides utilities for getting the effective tax rate based on:
 * 1. Provider's tax_rate_percent (if configured)
 * 2. Platform default_tax_rate (from platform_settings)
 * 3. Hardcoded fallback (15%)
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_TAX_RATE = 15.00; // 15% fallback

/**
 * Get the effective tax rate for a provider
 * Priority: provider tax_rate_percent → platform default_tax_rate → 15% fallback
 * 
 * @param providerId - Provider ID (optional, if not provided, returns platform default or fallback)
 * @param providerTaxRate - Provider's tax_rate_percent (optional, if provided, skips database lookup)
 * @returns Tax rate as a percentage (e.g., 15.00 for 15%)
 */
export async function getEffectiveTaxRate(
  providerId?: string,
  providerTaxRate?: number | null
): Promise<number> {
  try {
    const supabaseAdmin = await getSupabaseAdmin();
    
    // If provider tax rate is provided and >= 0, use it (0% is valid for non-VAT)
    if (providerTaxRate !== undefined && providerTaxRate !== null) {
      return providerTaxRate;
    }
    
    // If provider ID is provided, try to get provider's tax rate
    if (providerId) {
      const { data: provider } = await supabaseAdmin
        .from("providers")
        .select("tax_rate_percent")
        .eq("id", providerId)
        .single();
      
      // Return provider's tax rate if explicitly set (including 0% for non-VAT)
      if (provider?.tax_rate_percent !== undefined && provider?.tax_rate_percent !== null) {
        return provider.tax_rate_percent;
      }
    }
    
    // Get platform default tax rate
    const { data: platformSettings } = await supabaseAdmin
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (platformSettings?.settings) {
      const defaultTaxRate = (platformSettings.settings as any)?.taxes?.default_tax_rate;
      // Return platform default if explicitly set (including 0%)
      if (defaultTaxRate !== undefined && defaultTaxRate !== null) {
        return Number(defaultTaxRate);
      }
    }
    
    // Fallback to hardcoded default
    return DEFAULT_TAX_RATE;
  } catch (error) {
    console.warn("Failed to get tax rate from database, using fallback:", error);
    return DEFAULT_TAX_RATE;
  }
}

/**
 * Get the platform default tax rate (without provider-specific lookup)
 * @returns Tax rate as a percentage (e.g., 15.00 for 15%)
 */
export async function getPlatformDefaultTaxRate(): Promise<number> {
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
      const defaultTaxRate = (platformSettings.settings as any)?.taxes?.default_tax_rate;
      // Return platform default if explicitly set (including 0%)
      if (defaultTaxRate !== undefined && defaultTaxRate !== null) {
        return Number(defaultTaxRate);
      }
    }
    
    return DEFAULT_TAX_RATE;
  } catch (error) {
    console.warn("Failed to get platform default tax rate, using fallback:", error);
    return DEFAULT_TAX_RATE;
  }
}
