import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, badRequestResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/loyalty-points/calculate-redemption
 * Calculate how much discount can be obtained from redeeming points
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { points_to_redeem, booking_subtotal } = body;

    if (typeof points_to_redeem !== 'number' || typeof booking_subtotal !== 'number') {
      return badRequestResponse("points_to_redeem and booking_subtotal are required");
    }

    // Get loyalty config
    const { data: config } = await supabase
      .from("loyalty_point_config")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!config) {
      return badRequestResponse("Loyalty points system not configured");
    }

    // Get customer's available balance
    const { data: balanceData } = await supabase
      .rpc('get_customer_available_points', { customer_uuid: user.id });

    const available_balance = balanceData || 0;

    // Validation
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

    // Calculate discount amount
    const discount_amount = points_to_redeem / config.redemption_rate;

    // Check max redemption percentage
    const max_discount_allowed = booking_subtotal * (config.max_redemption_percentage / 100);
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
        max_redeemable_points: Math.floor((booking_subtotal * (config.max_redemption_percentage / 100)) * config.redemption_rate),
        max_redeemable_amount: booking_subtotal * (config.max_redemption_percentage / 100),
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
