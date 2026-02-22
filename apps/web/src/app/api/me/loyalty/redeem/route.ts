import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const redeemSchema = z.object({
  points: z.number().min(1, "Points must be at least 1"),
  description: z.string().optional(),
});

/**
 * POST /api/me/loyalty/redeem
 * 
 * Redeem loyalty points for cash/discount
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json();
    const validated = redeemSchema.parse(body);

    const supabase = await getSupabaseServer();
    const adminSupabase = getSupabaseAdmin();

    // Get current points balance
    const { data: balanceData } = await supabase.rpc("get_user_loyalty_balance", { p_user_id: user.id });

    const currentBalance = balanceData != null ? Number(balanceData) : 0;

    if (validated.points > currentBalance) {
      return handleApiError(
        new Error("Insufficient points"),
        "You don't have enough points to redeem this amount",
        "INSUFFICIENT_POINTS",
        400
      );
    }

    // Get redemption rate
    const { data: activeRule } = await supabase
      .from("loyalty_rules")
      .select("redemption_rate, currency")
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    const redemptionRate = Number(activeRule?.redemption_rate) || 100;
    const currency = activeRule?.currency || "ZAR";
    const redemptionValue = validated.points / redemptionRate;

    // Create redemption transaction
    const { data: transaction, error: transactionError } = await adminSupabase
      .from("loyalty_point_transactions")
      .insert({
        user_id: user.id,
        points: validated.points,
        transaction_type: "redeemed",
        description: validated.description || `Redeemed ${validated.points} points for ${redemptionValue} ${currency}`,
      })
      .select()
      .single();

    if (transactionError) {
      throw transactionError;
    }

    // Add redemption value to user wallet
    try {
      await adminSupabase.rpc("add_wallet_balance", {
        p_user_id: user.id,
        p_amount: redemptionValue,
        p_currency: currency,
        p_description: `Loyalty points redemption: ${validated.points} points`,
      });
    } catch (walletError) {
      // Wallet function might not exist, log but don't fail
      console.warn("Failed to add to wallet:", walletError);
    }

    return successResponse({
      transaction,
      points_redeemed: validated.points,
      redemption_value: redemptionValue,
      currency,
      new_balance: currentBalance - validated.points,
      message: "Points redeemed successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to redeem points");
  }
}
