import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, badRequestResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { validatePromoCode } from "@/lib/promotions/validate";
import { resolveCheckoutPromotionDiscount } from "@/lib/pricing/checkout-promotion-discount";
import { z } from "zod";

const validateBodySchema = z.object({
  code: z.string().min(1, "Promo code is required"),
  provider_id: z.guid("Invalid provider ID"),
  booking_amount: z.number().min(0, "Booking amount must be non-negative"),
  location_type: z.string().optional(),
  location_id: z.guid().optional().nullable(),
});

/**
 * POST /api/public/promotions/validate
 *
 * Validates a promo code scoped to a provider and returns discount information.
 *
 * Request body:
 * {
 *   code: string;
 *   provider_id: string;
 *   booking_amount: number; // Subtotal before discount
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) {
      return tenantRes;
    }
    const { tenantId } = tenantRes;

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const parsed = validateBodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequestResponse(
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      );
    }

    const { code, provider_id, booking_amount, location_type, location_id } = parsed.data;

    const { data: providerOk } = await supabase
      .from("providers")
      .select("id")
      .eq("id", provider_id)
      .maybeSingle();
    if (!providerOk) {
      return badRequestResponse("Invalid provider");
    }

    const locationTypeNorm = location_type === "at_home" ? "at_home" : "at_salon";

    // Same resolver as `validate-booking.ts` (promotions table + legacy coupons).
    const resolved = await resolveCheckoutPromotionDiscount(supabase, {
      promoCode: code.trim().toUpperCase(),
      providerId: provider_id,
      promoTenantId: tenantId,
      prePromoSubtotal: booking_amount,
      locationType: locationTypeNorm,
      locationId: location_id ?? null,
    });

    if (resolved.promotionDiscountAmount > 0) {
      const amount = resolved.promotionDiscountAmount;
      return successResponse({
        valid: true,
        promotion: resolved.promotionId ? { id: resolved.promotionId } : null,
        discount: {
          amount,
          original_amount: booking_amount,
          final_amount: Math.max(0, booking_amount - amount),
          percentage: null,
        },
      });
    }

    const result = await validatePromoCode(supabase, {
      code,
      amount: booking_amount,
      providerId: provider_id,
      locationType: location_type,
      locationId: location_id ?? undefined,
    });

    if (!result.valid) {
      return badRequestResponse(result.message || "Invalid promo code");
    }

    return successResponse({
      valid: true,
      promotion: result.promotion,
      discount: result.discount,
    });
  } catch (error) {
    return handleApiError(error, "Failed to validate promo code");
  }
}
