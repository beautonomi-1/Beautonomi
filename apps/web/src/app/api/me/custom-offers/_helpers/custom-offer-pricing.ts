/**
 * Custom offer pricing: tax, platform service fee, promo code, tip.
 * Mirrors logic from validate-booking for consistency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveTaxRate } from "@/lib/platform-tax-settings";

export interface CustomOfferPricingInput {
  offerPrice: number;
  travelFee: number;
  currency: string;
  providerId: string;
  customerId: string;
  tipAmount?: number;
  promotionCode?: string | null;
  locationType?: "at_salon" | "at_home";
  locationId?: string | null;
}

export interface CustomOfferPricingResult {
  subtotal: number;
  travelFee: number;
  promotionId: string | null;
  promotionDiscountAmount: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  serviceFeePercentage: number;
  serviceFeeAmount: number;
  tipAmount: number;
  totalAmount: number;
  commissionBase: number;
}

export async function computeCustomOfferPricing(
  supabase: SupabaseClient,
  input: CustomOfferPricingInput
): Promise<{ ok: true; result: CustomOfferPricingResult } | { ok: false; error: string }> {
  const {
    offerPrice,
    travelFee,
    currency,
    providerId,
    customerId,
    tipAmount: inputTip = 0,
    promotionCode = null,
    locationType = "at_salon",
    locationId = null,
  } = input;

  const subtotalBeforeDiscount = Math.max(0, offerPrice) + Math.max(0, travelFee);

  // Load provider for tax, tips, fee config
  const { data: provider } = await supabase
    .from("providers")
    .select("tax_rate_percent, tips_enabled, customer_fee_config_id")
    .eq("id", providerId)
    .single();

  const tipsEnabled = Boolean((provider as any)?.tips_enabled ?? true);
  const tipAmount = tipsEnabled ? Math.max(0, Number(inputTip) || 0) : 0;

  // Promo code
  let promotionId: string | null = null;
  let promotionDiscountAmount = 0;
  const promoCode = (promotionCode || "").toString().trim().toUpperCase();

  if (promoCode) {
    const { data: promo } = await (supabase.from("promotions") as any)
      .select(
        "id, code, type, value, min_purchase_amount, max_discount_amount, valid_from, valid_until, usage_limit, usage_count, is_active, location_id"
      )
      .eq("code", promoCode)
      .single();

    if (promo) {
      const now = new Date();
      const validFrom = promo.valid_from ? new Date(promo.valid_from) : null;
      const validUntil = promo.valid_until ? new Date(promo.valid_until) : null;
      const withinWindow = (!validFrom || now >= validFrom) && (!validUntil || now <= validUntil);
      const underLimit = promo.usage_limit == null || (promo.usage_count || 0) < promo.usage_limit;
      const meetsMin = !promo.min_purchase_amount || subtotalBeforeDiscount >= Number(promo.min_purchase_amount);
      const locationOk =
        promo.location_id == null || (locationType === "at_salon" && locationId === promo.location_id);

      if (promo.is_active && withinWindow && underLimit && meetsMin && locationOk) {
        if (promo.type === "percentage") {
          promotionDiscountAmount = (subtotalBeforeDiscount * Number(promo.value || 0)) / 100;
        } else {
          promotionDiscountAmount = Number(promo.value || 0);
        }
        if (promo.max_discount_amount) {
          promotionDiscountAmount = Math.min(promotionDiscountAmount, Number(promo.max_discount_amount));
        }
        promotionDiscountAmount = Math.max(0, Math.min(promotionDiscountAmount, subtotalBeforeDiscount));
        promotionId = promo.id;
      }
    }
  }

  const subtotalAfterDiscount = Math.max(0, subtotalBeforeDiscount - promotionDiscountAmount);
  const discountAmount = promotionDiscountAmount;

  // Tax: provider rate or platform default
  const taxRate = await getEffectiveTaxRate(providerId, (provider as any)?.tax_rate_percent ?? null);
  const taxAmount =
    taxRate > 0 ? Number(((subtotalAfterDiscount * taxRate) / 100).toFixed(2)) : 0;

  // Platform service fee: provider fee config or platform settings
  let serviceFeeAmount = 0;
  let serviceFeePercentage = 0;

  if ((provider as any)?.customer_fee_config_id) {
    const { data: feeConfig } = await supabase
      .from("platform_fee_config")
      .select("id, fee_type, fee_percentage, fee_fixed_amount, min_booking_amount, max_fee_amount")
      .eq("id", (provider as any).customer_fee_config_id)
      .eq("is_active", true)
      .single();

    if (feeConfig) {
      const minBookingAmount = Number(feeConfig.min_booking_amount || 0);
      if (subtotalAfterDiscount >= minBookingAmount) {
        if (feeConfig.fee_type === "percentage") {
          serviceFeePercentage = Number(feeConfig.fee_percentage || 0);
          serviceFeeAmount = Number(((subtotalAfterDiscount * serviceFeePercentage) / 100).toFixed(2));
          if (feeConfig.max_fee_amount) {
            serviceFeeAmount = Math.min(serviceFeeAmount, Number(feeConfig.max_fee_amount));
          }
        } else if (feeConfig.fee_type === "fixed_amount") {
          serviceFeeAmount = Number(feeConfig.fee_fixed_amount || 0);
        }
      }
    }
  }

  if (serviceFeeAmount === 0) {
    const { data: platformRow } = await (supabase.from("platform_settings") as any)
      .select("settings")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payoutSettings = (platformRow as any)?.settings?.payouts || {};
    const feeType = payoutSettings.platform_service_fee_type || "percentage";
    const feePct = payoutSettings.platform_service_fee_percentage ?? 0;
    const feeFixed = payoutSettings.platform_service_fee_fixed ?? 0;

    if (feeType === "percentage") {
      serviceFeePercentage = feePct;
      serviceFeeAmount = Number(((subtotalAfterDiscount * serviceFeePercentage) / 100).toFixed(2));
    } else {
      serviceFeeAmount = feeFixed;
    }
  }

  const totalAmount = Number(
    (subtotalAfterDiscount + taxAmount + serviceFeeAmount + tipAmount).toFixed(2)
  );
  const commissionBase = subtotalAfterDiscount;

  return {
    ok: true,
    result: {
      subtotal: Number(offerPrice),
      travelFee: Number(travelFee),
      promotionId,
      promotionDiscountAmount,
      discountAmount,
      taxRate,
      taxAmount,
      serviceFeePercentage,
      serviceFeeAmount,
      tipAmount,
      totalAmount,
      commissionBase,
    },
  };
}
