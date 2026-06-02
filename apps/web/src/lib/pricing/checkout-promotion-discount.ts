/**
 * Shared promotion / coupon resolution for customer checkout surfaces.
 * Matches `validate-booking.ts` (public booking API) so custom-offer quote/pay
 * cannot drift from standard bookings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { percentOf } from "@beautonomi/utils";

export type CheckoutPromotionLocation = "at_salon" | "at_home";

export interface ResolveCheckoutPromotionDiscountInput {
  /** Uppercase trimmed code from the client */
  promoCode: string;
  providerId: string | undefined;
  /**
   * `promotions.tenant_id` (NOT NULL in MT schema). Use provider.tenant_id or host tenant.
   */
  promoTenantId: string;
  /** Lines + travel (or equivalent) before promo — cap and percentage base */
  prePromoSubtotal: number;
  locationType: CheckoutPromotionLocation;
  locationId: string | null;
}

export interface ResolveCheckoutPromotionDiscountResult {
  promotionId: string | null;
  promotionDiscountAmount: number;
}

const PROMO_SELECT_COLS =
  "id, code, type, value, min_purchase_amount, max_discount_amount, valid_from, valid_until, usage_limit, usage_count, is_active, location_id, provider_id, applicable_providers";

/**
 * Resolve active promotion or legacy coupon discount for checkout.
 * Caller must pass a Supabase client with the same RLS posture as public booking
 * (typically the authenticated customer session).
 */
export async function resolveCheckoutPromotionDiscount(
  supabase: SupabaseClient,
  input: ResolveCheckoutPromotionDiscountInput,
): Promise<ResolveCheckoutPromotionDiscountResult> {
  const { promoCode, providerId, promoTenantId, prePromoSubtotal, locationType, locationId } = input;

  let promotionId: string | null = null;
  let promotionDiscountAmount = 0;

  if (!promoCode || prePromoSubtotal < 0) {
    return { promotionId, promotionDiscountAmount };
  }

  const tenantFilter = promoTenantId.trim().length > 0;

  let promo: Record<string, unknown> | null = null;
  if (providerId) {
    let q = (supabase.from("promotions") as any)
      .select(PROMO_SELECT_COLS)
      .eq("code", promoCode)
      .eq("provider_id", providerId);
    if (tenantFilter) q = q.eq("tenant_id", promoTenantId);
    const { data: providerPromo } = await q.maybeSingle();
    promo = providerPromo ?? null;
  }
  if (!promo) {
    let q = (supabase.from("promotions") as any)
      .select(PROMO_SELECT_COLS)
      .eq("code", promoCode)
      .is("provider_id", null);
    if (tenantFilter) q = q.eq("tenant_id", promoTenantId);
    const { data: platformPromo } = await q.maybeSingle();
    promo = platformPromo ?? null;
  }

  if (promo) {
    const applicableProviders = (promo.applicable_providers as string[] | null) || [];
    const providerOk =
      promo.provider_id != null ||
      applicableProviders.length === 0 ||
      (providerId != null && applicableProviders.includes(providerId));

    const now = new Date();
    const validFrom = promo.valid_from ? new Date(promo.valid_from as string) : null;
    const validUntil = promo.valid_until ? new Date(promo.valid_until as string) : null;
    const withinWindow = (!validFrom || now >= validFrom) && (!validUntil || now <= validUntil);
    const underLimit =
      promo.usage_limit == null || Number(promo.usage_count || 0) < Number(promo.usage_limit);
    const meetsMin =
      !promo.min_purchase_amount || prePromoSubtotal >= Number(promo.min_purchase_amount);
    const locationOk =
      promo.location_id == null || (locationType === "at_salon" && locationId === promo.location_id);

    if (promo.is_active && providerOk && withinWindow && underLimit && meetsMin && locationOk) {
      if (promo.type === "percentage") {
        promotionDiscountAmount = percentOf(prePromoSubtotal, Number(promo.value || 0));
      } else {
        promotionDiscountAmount = Number(promo.value || 0);
      }
      if (promo.max_discount_amount) {
        promotionDiscountAmount = Math.min(promotionDiscountAmount, Number(promo.max_discount_amount));
      }
      promotionDiscountAmount = Math.max(0, Math.min(promotionDiscountAmount, prePromoSubtotal));
      promotionId = String(promo.id);
    }
  }

  if (!promotionId) {
    // Legacy platform `coupons` table. §Coupon-audit 2026-06: this query
    // previously selected non-existent columns (`max_discount`, `expires_at`,
    // `used_count`), so it always errored and the fallback was effectively dead;
    // it also assigned `coupon.id` to `promotionId`, which violates the
    // bookings.promotion_id -> promotions(id) FK. We now use the real columns
    // (`max_discount_amount`, `valid_from`/`valid_until`, usage via `user_coupons`)
    // and DO NOT return the coupon id as a promotion id — the discount is applied
    // but `promotionId` stays null so the booking insert cannot break the FK.
    const { data: coupon } = await (supabase.from("coupons") as any)
      .select(
        "id, code, discount_type, discount_value, min_purchase_amount, max_discount_amount, is_active, valid_from, valid_until, max_uses",
      )
      .eq("code", promoCode)
      .eq("is_active", true)
      .maybeSingle();

    if (coupon) {
      const now = new Date();
      const validFrom = coupon.valid_from ? new Date(coupon.valid_from as string) : null;
      const validUntil = coupon.valid_until ? new Date(coupon.valid_until as string) : null;
      const withinWindow = (!validFrom || now >= validFrom) && (!validUntil || now <= validUntil);
      const meetsMin =
        !coupon.min_purchase_amount || prePromoSubtotal >= Number(coupon.min_purchase_amount);

      let underLimit = true;
      if (coupon.max_uses) {
        const { count } = await (supabase.from("user_coupons") as any)
          .select("id", { count: "exact", head: true })
          .eq("coupon_id", coupon.id);
        underLimit = Number(count ?? 0) < Number(coupon.max_uses);
      }

      if (withinWindow && meetsMin && underLimit) {
        if (coupon.discount_type === "percentage") {
          promotionDiscountAmount = percentOf(prePromoSubtotal, Number(coupon.discount_value || 0));
          if (coupon.max_discount_amount) {
            promotionDiscountAmount = Math.min(
              promotionDiscountAmount,
              Number(coupon.max_discount_amount),
            );
          }
        } else {
          promotionDiscountAmount = Number(coupon.discount_value || 0);
        }
        promotionDiscountAmount = Math.max(0, Math.min(promotionDiscountAmount, prePromoSubtotal));
        // Intentionally leave promotionId null (FK safety — see comment above).
      }
    }
  }

  return { promotionId, promotionDiscountAmount };
}
