import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

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
    const supabase = await getSupabaseServer();

    if (body.type === "coupon") {
      // Validate coupon
      const { data: coupon, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", body.code.toUpperCase())
        .eq("is_active", true)
        .single();

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
        discount = (body.cartTotal * coupon.discount_value) / 100;
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
      const { data: giftCard, error } = await supabase
        .from("gift_cards")
        .select("*")
        .eq("code", body.code)
        .eq("status", "active")
        .single();

      if (error || !giftCard) {
        return successResponse({
          valid: false,
          message: "Invalid gift card code",
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
