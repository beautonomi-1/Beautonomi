/**
 * Platform Sales Settings Helper
 * 
 * Provides utilities for managing platform-wide sales defaults and constraints
 * that providers can override with their own settings.
 */

import { getSupabaseServer } from "@/lib/supabase/server";

export interface PlatformSalesDefaults {
  tax_rate_percent?: number;
  receipt_prefix?: string;
  receipt_next_number?: number;
  receipt_header?: string | null;
  receipt_footer?: string | null;
  gift_cards_enabled?: boolean;
  gift_card_terms?: string | null;
  service_charge_name?: string;
  service_charge_rate?: number;
  upselling_enabled?: boolean;
}

export interface PlatformSalesConstraints {
  max_tax_rate_percent?: number;
  required_receipt_fields?: string[];
  max_receipt_prefix_length?: number;
  min_receipt_next_number?: number;
  max_receipt_header_length?: number;
  max_receipt_footer_length?: number;
}

export interface PlatformSalesSettings {
  defaults?: PlatformSalesDefaults;
  constraints?: PlatformSalesConstraints;
}

const DEFAULT_SALES_SETTINGS: PlatformSalesSettings = {
  defaults: {
    tax_rate_percent: 0,
    receipt_prefix: "REC",
    receipt_next_number: 1,
    receipt_header: null,
    receipt_footer: null,
    gift_cards_enabled: false,
    gift_card_terms: null,
    service_charge_name: "Service Charge",
    service_charge_rate: 0,
    upselling_enabled: false,
  },
  constraints: {
    max_tax_rate_percent: 30,
    required_receipt_fields: ["receipt_number", "date", "total"],
    max_receipt_prefix_length: 20,
    min_receipt_next_number: 1,
    max_receipt_header_length: 2000,
    max_receipt_footer_length: 2000,
  },
};

/**
 * Get platform sales settings (defaults and constraints)
 */
export async function getPlatformSalesSettings(): Promise<PlatformSalesSettings> {
  try {
    const supabase = await getSupabaseServer();
    
    const { data: settings, error } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .single();

    if (error || !settings) {
      return DEFAULT_SALES_SETTINGS;
    }

    const platformSettings = (settings as any).settings || {};
    const salesSettings: PlatformSalesSettings = platformSettings.sales || {};

    // Merge with defaults to ensure all fields are present
    return {
      defaults: {
        ...DEFAULT_SALES_SETTINGS.defaults,
        ...salesSettings.defaults,
      },
      constraints: {
        ...DEFAULT_SALES_SETTINGS.constraints,
        ...salesSettings.constraints,
      },
    };
  } catch (error) {
    console.error("Error loading platform sales settings:", error);
    return DEFAULT_SALES_SETTINGS;
  }
}

/**
 * Get platform sales defaults
 */
export async function getPlatformSalesDefaults(): Promise<PlatformSalesDefaults> {
  const settings = await getPlatformSalesSettings();
  return settings.defaults || DEFAULT_SALES_SETTINGS.defaults!;
}

/**
 * Get platform sales constraints
 */
export async function getPlatformSalesConstraints(): Promise<PlatformSalesConstraints> {
  const settings = await getPlatformSalesSettings();
  return settings.constraints || DEFAULT_SALES_SETTINGS.constraints!;
}

/**
 * Merge provider settings with platform defaults
 * Provider settings take precedence over platform defaults
 */
export function mergeWithPlatformDefaults<T extends Record<string, any>>(
  providerSettings: Partial<T>,
  platformDefaults: Partial<T>
): T {
  return {
    ...platformDefaults,
    ...providerSettings,
  } as T;
}

/**
 * Validate provider settings against platform constraints
 */
export function validateAgainstConstraints(
  field: string,
  value: any,
  constraints: PlatformSalesConstraints
): { valid: boolean; error?: string } {
  switch (field) {
    case "tax_rate_percent":
      if (typeof value === "number") {
        const maxRate = constraints.max_tax_rate_percent ?? 30;
        if (value < 0 || value > maxRate) {
          return {
            valid: false,
            error: `Tax rate must be between 0 and ${maxRate}%`,
          };
        }
      }
      break;

    case "receipt_prefix":
      if (typeof value === "string") {
        const maxLength = constraints.max_receipt_prefix_length ?? 20;
        if (value.length > maxLength) {
          return {
            valid: false,
            error: `Receipt prefix must be ${maxLength} characters or less`,
          };
        }
      }
      break;

    case "receipt_next_number":
      if (typeof value === "number") {
        const minNumber = constraints.min_receipt_next_number ?? 1;
        if (value < minNumber) {
          return {
            valid: false,
            error: `Receipt next number must be at least ${minNumber}`,
          };
        }
      }
      break;

    case "receipt_header":
      if (typeof value === "string") {
        const maxLength = constraints.max_receipt_header_length ?? 2000;
        if (value.length > maxLength) {
          return {
            valid: false,
            error: `Receipt header must be ${maxLength} characters or less`,
          };
        }
      }
      break;

    case "receipt_footer":
      if (typeof value === "string") {
        const maxLength = constraints.max_receipt_footer_length ?? 2000;
        if (value.length > maxLength) {
          return {
            valid: false,
            error: `Receipt footer must be ${maxLength} characters or less`,
          };
        }
      }
      break;
  }

  return { valid: true };
}
