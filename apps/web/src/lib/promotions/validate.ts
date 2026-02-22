/**
 * Shared Promo Code Validation Logic
 *
 * Used by both:
 *  - POST /api/public/promotions/validate  (provider-scoped, detailed response)
 *  - GET  /api/public/promo-codes/validate (lightweight, query-param based)
 *
 * Centralises all validation rules so they stay in sync.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PromoValidationInput {
  code: string;
  amount: number;
  /** When provided the lookup is scoped to this provider */
  providerId?: string;
}

export interface PromoValidationResult {
  valid: boolean;
  message?: string;
  promotion?: {
    id: string;
    code: string;
    type: string;
    value: number;
    description: string | null;
    min_booking_amount: number | null;
    min_purchase_amount: number | null;
    max_discount_amount: number | null;
    max_uses: number | null;
    usage_limit: number | null;
    uses_count: number | null;
    usage_count: number | null;
    start_date: string | null;
    end_date: string | null;
    valid_from: string | null;
    valid_until: string | null;
  };
  discount: {
    amount: number;
    original_amount: number;
    final_amount: number;
    percentage: number | null;
  };
}

/**
 * Core promo-code validation that both API routes share.
 * Returns a discriminated result so callers can format their own HTTP response.
 */
export async function validatePromoCode(
  supabase: SupabaseClient,
  input: PromoValidationInput
): Promise<PromoValidationResult> {
  const { code, amount, providerId } = input;
  const normalizedCode = code.trim().toUpperCase();

  // Build query
  let query = supabase
    .from("promotions")
    .select("*")
    .eq("code", normalizedCode)
    .eq("is_active", true);

  if (providerId) {
    query = query.eq("provider_id", providerId);
  }

  const { data: promo, error } = await query.maybeSingle();

  if (error || !promo) {
    return {
      valid: false,
      message: "Invalid or expired promo code",
      discount: { amount: 0, original_amount: amount, final_amount: amount, percentage: null },
    };
  }

  // Date validation (supports both column naming conventions)
  const now = new Date();
  const startDate = promo.start_date ?? promo.valid_from;
  const endDate = promo.end_date ?? promo.valid_until;

  if (startDate && now < new Date(startDate)) {
    return {
      valid: false,
      message: "This promo code is not yet valid",
      discount: { amount: 0, original_amount: amount, final_amount: amount, percentage: null },
    };
  }

  if (endDate && now > new Date(endDate)) {
    return {
      valid: false,
      message: "This promo code has expired",
      discount: { amount: 0, original_amount: amount, final_amount: amount, percentage: null },
    };
  }

  // Usage limit (supports both column naming conventions)
  const maxUses = promo.max_uses ?? promo.usage_limit ?? null;
  const usesCount = promo.uses_count ?? promo.usage_count ?? 0;

  if (maxUses !== null && maxUses !== undefined && usesCount >= maxUses) {
    return {
      valid: false,
      message: "This promo code has reached its usage limit",
      discount: { amount: 0, original_amount: amount, final_amount: amount, percentage: null },
    };
  }

  // Minimum purchase / booking amount
  const minAmount = Number(promo.min_booking_amount ?? promo.min_purchase_amount ?? 0);
  if (minAmount > 0 && amount > 0 && amount < minAmount) {
    return {
      valid: false,
      message: `Minimum amount of ${promo.currency ?? ""} ${minAmount} required for this promo code`.trim(),
      discount: { amount: 0, original_amount: amount, final_amount: amount, percentage: null },
    };
  }

  // Calculate discount
  let discountAmount = 0;
  if (amount > 0) {
    if (promo.type === "percentage") {
      discountAmount = (amount * Number(promo.value ?? 0)) / 100;
    } else {
      discountAmount = Number(promo.value ?? 0);
    }

    // Cap at max discount if defined
    const maxDiscount = promo.max_discount_amount ? Number(promo.max_discount_amount) : null;
    if (maxDiscount) {
      discountAmount = Math.min(discountAmount, maxDiscount);
    }

    // Never discount more than the total
    discountAmount = Math.max(0, Math.min(discountAmount, amount));
  }

  return {
    valid: true,
    promotion: {
      id: promo.id,
      code: promo.code,
      type: promo.type,
      value: Number(promo.value ?? 0),
      description: promo.description ?? promo.name ?? null,
      min_booking_amount: promo.min_booking_amount ?? null,
      min_purchase_amount: promo.min_purchase_amount ?? null,
      max_discount_amount: promo.max_discount_amount ?? null,
      max_uses: promo.max_uses ?? null,
      usage_limit: promo.usage_limit ?? null,
      uses_count: promo.uses_count ?? null,
      usage_count: promo.usage_count ?? null,
      start_date: promo.start_date ?? null,
      end_date: promo.end_date ?? null,
      valid_from: promo.valid_from ?? null,
      valid_until: promo.valid_until ?? null,
    },
    discount: {
      amount: discountAmount,
      original_amount: amount,
      final_amount: amount - discountAmount,
      percentage: promo.type === "percentage" ? Number(promo.value) : null,
    },
  };
}
