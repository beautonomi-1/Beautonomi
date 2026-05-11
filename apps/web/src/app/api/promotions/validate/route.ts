import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { z } from "zod";
import { percentOf } from "@beautonomi/utils";

const validateSchema = z.object({
  code: z.string().min(1, "Code is required"),
  cartTotal: z.number().min(0),
  clientId: z.string().uuid().optional(),
  type: z.enum(["coupon", "gift_card"]),
});

/**
 * POST /api/promotions/validate
 * 
 * Validate coupon codes, gift cards, and calculate discounts
 */
export async function POST(request: NextRequest) {
  try {
    const body = validateSchema.parse(await request.json());
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const supabase = await getSupabaseServer(request);

    if (body.type === "coupon") {
      // Validate coupon — use admin client so RLS does not block the read on the coupons table.
      const supabaseAdmin = getSupabaseAdmin();
      const { data: coupon, error } = await supabaseAdmin
        .from("coupons")
        .select("*")
        .eq("code", body.code.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (error || !coupon) {
        return successResponse({
          valid: false,
          message: "Invalid coupon code",
        });
      }

      // Check expiry
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return successResponse({
          valid: false,
          message: "This coupon has expired",
        });
      }

      // Check usage limits
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        return successResponse({
          valid: false,
          message: "This coupon has reached its usage limit",
        });
      }

      // Calculate discount
      let discount = 0;
      if (coupon.discount_type === "percentage") {
        discount = percentOf(body.cartTotal, coupon.discount_value);
        if (coupon.max_discount) {
          discount = Math.min(discount, coupon.max_discount);
        }
      } else {
        discount = coupon.discount_value;
      }

      return successResponse({
        valid: true,
        discount: Math.min(discount, body.cartTotal),
        message: "Coupon applied successfully",
      });
    } else if (body.type === "gift_card") {
      // Validate gift card
      const supabaseAdmin = getSupabaseAdmin();
      const { data: giftCard, error } = await supabaseAdmin
        .from("gift_cards")
        .select("*")
        .eq("code", body.code.trim().toUpperCase())
        .eq("is_active", true)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error || !giftCard) {
        return successResponse({
          valid: false,
          message: "Invalid gift card code",
        });
      }

      if (giftCard.expires_at && new Date(giftCard.expires_at) < new Date()) {
        return successResponse({
          valid: false,
          message: "This gift card has expired",
        });
      }

      // Check balance
      if (giftCard.balance <= 0) {
        return successResponse({
          valid: false,
          message: "This gift card has no balance",
        });
      }

      // Use minimum of balance or cart total
      const amount = Math.min(giftCard.balance, body.cartTotal);

      return successResponse({
        valid: true,
        amount: amount,
        message: `Gift card applied: ${amount} available`,
      });
    }

    return successResponse({
      valid: false,
      message: "Invalid promotion type",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to validate promotion");
  }
}
