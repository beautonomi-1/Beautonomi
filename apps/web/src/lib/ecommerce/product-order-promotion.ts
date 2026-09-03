/**
 * Promotion code on product checkout. Validation reuses the booking promo rules
 * (`validatePromoCode`); usage is recorded once per (promotion, user, order) via
 * the partial unique index added in migration 879 and the shared atomic counter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePromoCode, type PromoValidationResult } from "@/lib/promotions/validate";

export type ProductPromotionResult =
  | { ok: true; promotionId: string; code: string; discountAmount: number }
  | { ok: false; message: string };

export async function applyProductOrderPromotion(
  supabase: SupabaseClient,
  params: { code: string; subtotal: number; providerId: string; locationId?: string | null },
): Promise<ProductPromotionResult> {
  const code = params.code.trim().toUpperCase();
  if (!code) return { ok: false, message: "Promo code is required" };

  let result: PromoValidationResult;
  try {
    result = await validatePromoCode(supabase, {
      code,
      amount: Math.max(0, Number(params.subtotal) || 0),
      providerId: params.providerId,
      // Product checkout is not salon-located; location-scoped promos don't apply.
      locationType: params.locationId ? "at_salon" : undefined,
      locationId: params.locationId ?? null,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Promo code could not be validated" };
  }

  if (!result.valid || !result.promotion) {
    return { ok: false, message: result.message || "Invalid or expired promo code" };
  }
  const discountAmount = Math.round(Math.max(0, Number(result.discount.amount) || 0) * 100) / 100;
  return { ok: true, promotionId: result.promotion.id, code: result.promotion.code, discountAmount };
}

/**
 * Record a promotion redemption for a product order exactly once and bump
 * `promotions.usage_count`. Never throws (usage accounting must not break payment).
 */
export async function recordProductOrderPromotionUsage(
  supabaseAdmin: SupabaseClient,
  params: { promotionId: string; userId: string; productOrderId: string; discountAmount: number },
): Promise<void> {
  const { promotionId, userId, productOrderId, discountAmount } = params;
  if (!promotionId || !userId || !productOrderId || !(discountAmount > 0)) return;
  try {
    const { data: usageRow, error } = await (supabaseAdmin.from("promotion_usage") as any)
      .upsert(
        {
          promotion_id: promotionId,
          user_id: userId,
          booking_id: null,
          product_order_id: productOrderId,
          discount_amount: discountAmount,
          used_at: new Date().toISOString(),
        },
        { onConflict: "promotion_id,user_id,product_order_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[recordProductOrderPromotionUsage] usage row failed:", error.message);
      return;
    }
    if (usageRow?.id) {
      const { error: incError } = await (supabaseAdmin.rpc as any)("increment_promotion_usage", {
        p_promotion_id: promotionId,
      });
      if (incError) {
        console.error("[recordProductOrderPromotionUsage] usage_count bump failed:", incError.message);
      }
    }
  } catch (e) {
    console.error("[recordProductOrderPromotionUsage] unexpected:", e instanceof Error ? e.message : String(e));
  }
}
