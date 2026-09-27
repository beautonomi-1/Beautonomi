import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, successResponse, badRequestResponse, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { percentOf } from "@beautonomi/utils";
import { resolveLoyaltyConfig } from "@/lib/loyalty/resolve-loyalty-config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * POST /api/me/loyalty-points/calculate-redemption
 * Calculate how much discount can be obtained from redeeming points
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const body = await request.json();
    const { points_to_redeem, booking_subtotal } = body;

    if (typeof points_to_redeem !== 'number' || typeof booking_subtotal !== 'number') {
      return badRequestResponse("points_to_redeem and booking_subtotal are required");
    }

    const admin = getSupabaseAdmin();
    const cfg = await resolveLoyaltyConfig(admin, LAST_RESORT_CURRENCY);
    const config = {
      redemption_rate: cfg.redemptionRate,
      min_redemption_points: cfg.minRedemptionPoints,
      max_redemption_percentage: cfg.maxRedemptionPercentage,
    };

    const { data: ledgerBal } = await supabase.rpc("get_customer_available_points", {
      customer_uuid: user.id,
    });
    const available_balance = Number(ledgerBal) || 0;

    const errors = [];
    let is_valid = true;

    if (points_to_redeem < config.min_redemption_points) {
      errors.push(`Minimum ${config.min_redemption_points} points required`);
      is_valid = false;
    }

    if (points_to_redeem > available_balance) {
      errors.push("Insufficient points balance");
      is_valid = false;
    }

    const discount_amount = points_to_redeem / config.redemption_rate;

    const max_discount_allowed = percentOf(booking_subtotal, config.max_redemption_percentage);
    let actual_discount = discount_amount;
    let actual_points = points_to_redeem;

    if (discount_amount > max_discount_allowed) {
      actual_discount = max_discount_allowed;
      actual_points = Math.floor(max_discount_allowed * config.redemption_rate);
      errors.push(`Discount capped at ${config.max_redemption_percentage}% of subtotal`);
      is_valid = false;
    }

    const balance_after = available_balance - actual_points;

    return successResponse({
      valid: is_valid && errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      calculation: {
        points_requested: points_to_redeem,
        points_to_redeem: actual_points,
        discount_amount: actual_discount,
        available_balance,
        balance_after,
        max_redeemable_points: Math.floor(percentOf(booking_subtotal, config.max_redemption_percentage) * config.redemption_rate),
        max_redeemable_amount: percentOf(booking_subtotal, config.max_redemption_percentage),
      },
      config: {
        redemption_rate: config.redemption_rate,
        min_redemption_points: config.min_redemption_points,
        max_redemption_percentage: config.max_redemption_percentage,
      },
    });

  } catch (error) {
    return handleApiError(error, "Failed to calculate redemption");
  }
}
