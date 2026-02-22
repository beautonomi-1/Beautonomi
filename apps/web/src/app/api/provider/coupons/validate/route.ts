import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/provider/coupons/validate
 * 
 * Validate a coupon code and calculate discount amount for a sale or booking
 * 
 * Query params:
 * - code: Coupon code to validate
 * - subtotal: Subtotal amount to calculate discount against (optional, for preview)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );    const { searchParams } = new URL(request.url);
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const code = searchParams.get('code');
    const subtotalParam = searchParams.get('subtotal');

    if (!code || !code.trim()) {
      return errorResponse("Coupon code is required", "VALIDATION_ERROR", 400);
    }

    const couponCode = code.trim().toUpperCase();
    const subtotal = subtotalParam ? parseFloat(subtotalParam) : null;

    // Get coupon by code
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', couponCode)
      .single();

    if (couponError || !coupon) {
      return errorResponse("Invalid coupon code", "INVALID_COUPON", 404);
    }

    // Validate coupon is active
    if (!coupon.is_active) {
      return errorResponse("This coupon is no longer active", "COUPON_INACTIVE", 400);
    }

    // Validate date range
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return errorResponse("This coupon is not yet valid", "COUPON_NOT_VALID_YET", 400);
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return errorResponse("This coupon has expired", "COUPON_EXPIRED", 400);
    }

    // Check max uses (global)
    if (coupon.max_uses !== null) {
      const { count: useCount } = await supabaseAdmin
        .from('user_coupons')
        .select('*', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id);

      if (useCount !== null && useCount >= coupon.max_uses) {
        return errorResponse("This coupon has reached its maximum usage limit", "COUPON_MAX_USES_EXCEEDED", 400);
      }
    }

    // Check max uses per user (if user is authenticated and provided)
    if (coupon.max_uses_per_user !== null && user) {
      const { count: userUseCount } = await supabaseAdmin
        .from('user_coupons')
        .select('*', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id)
        .eq('user_id', user.id);

      if (userUseCount !== null && userUseCount >= coupon.max_uses_per_user) {
        return errorResponse("You have reached the maximum usage limit for this coupon", "COUPON_USER_MAX_USES_EXCEEDED", 400);
      }
    }

    // Validate minimum purchase amount if subtotal is provided
    if (subtotal !== null && coupon.min_purchase_amount > 0) {
      if (subtotal < coupon.min_purchase_amount) {
        return errorResponse(
          `Minimum purchase amount of ${coupon.currency || 'ZAR'} ${coupon.min_purchase_amount.toFixed(2)} required`,
          "MIN_PURCHASE_NOT_MET",
          400
        );
      }
    }

    // Calculate discount amount based on subtotal
    let discountAmount = 0;
    if (subtotal !== null && subtotal > 0) {
      if (coupon.discount_type === 'percentage') {
        // Calculate percentage discount
        discountAmount = subtotal * (Number(coupon.discount_value) / 100);
        // Apply max discount cap if set
        if (coupon.max_discount_amount !== null && discountAmount > Number(coupon.max_discount_amount)) {
          discountAmount = Number(coupon.max_discount_amount);
        }
      } else if (coupon.discount_type === 'fixed') {
        // Fixed amount discount
        discountAmount = Number(coupon.discount_value);
        // Don't allow discount to exceed subtotal (financial integrity)
        if (discountAmount > subtotal) {
          discountAmount = subtotal;
        }
      }
      // Ensure discount is non-negative (financial integrity)
      discountAmount = Math.max(0, discountAmount);
    }
    // If subtotal not provided or is 0, return 0 (frontend will recalculate when subtotal changes)

    return successResponse({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        currency: coupon.currency || 'ZAR',
        max_discount_amount: coupon.max_discount_amount,
      },
      discount: discountAmount, // Return calculated discount amount (0 if subtotal not provided)
      discount_percentage: coupon.discount_type === 'percentage' ? coupon.discount_value : null,
      discount_fixed: coupon.discount_type === 'fixed' ? coupon.discount_value : null,
      min_purchase_amount: coupon.min_purchase_amount,
      message: subtotal !== null && subtotal > 0
        ? `Discount of ${coupon.currency || 'ZAR'} ${discountAmount.toFixed(2)} applied`
        : `Valid coupon: ${coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `${coupon.currency || 'ZAR'} ${coupon.discount_value}`} discount`,
    });
  } catch (error) {
    return handleApiError(error, "Failed to validate coupon");
  }
}
