import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { recordLoyaltyRedemption } from "@/lib/loyalty/record-redemption";

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

    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();

    const { data: redeemUserRow } = await adminSupabase
      .from("users")
      .select("preferred_home_tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    const redeemTenantId =
      (redeemUserRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ??
      null;

    // §Customer-audit 2026-04: check the canonical ledger first, then fall
    // back to the legacy balance function so users whose points come from
    // either source can redeem correctly. Previously this only consulted
    // `get_user_loyalty_balance`, so users who had earned via the ledger
    // (most recent path) saw "Insufficient points" even with a positive
    // balance shown in the UI.
    let currentBalance = 0;
    try {
      const { data: ledgerBalance } = await supabase.rpc(
        "get_customer_available_points",
        { customer_uuid: user.id },
      );
      currentBalance = Number(ledgerBalance) || 0;
    } catch {
      currentBalance = 0;
    }
    if (currentBalance <= 0) {
      const { data: legacyBalance } = await supabase.rpc(
        "get_user_loyalty_balance",
        { p_user_id: user.id },
      );
      currentBalance = Math.max(currentBalance, Number(legacyBalance) || 0);
    }

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
    const tenantFallback =
      redeemTenantId ? (await getTenantRegionConfig(redeemTenantId))?.defaultCurrency : null;
    const currency = activeRule?.currency || tenantFallback || LAST_RESORT_CURRENCY;
    const redemptionValue = validated.points / redemptionRate;

    const redeemWalletTenantId = await resolveTenantIdForFinanceLedger(adminSupabase, {
      tenant_id: redeemTenantId,
      provider_id: null,
    });

    const { error: walletError } = await (adminSupabase.rpc as any)("wallet_credit_admin", {
      p_user_id: user.id,
      p_amount: redemptionValue,
      p_currency: currency,
      p_description: `Loyalty points redemption: ${validated.points} points`,
      p_reference_id: null,
      p_reference_type: "loyalty_redeem",
      p_tenant_id: redeemWalletTenantId,
    });

    if (walletError) {
      console.error("Failed to credit wallet on loyalty redeem:", walletError);
      return handleApiError(
        walletError instanceof Error ? walletError : new Error("Wallet credit failed"),
        "Redemption failed. Please try again.",
        "WALLET_CREDIT_FAILED",
        500
      );
    }

    const redemptionDescription =
      validated.description ||
      `Redeemed ${validated.points} points for ${redemptionValue.toFixed(2)} ${currency} wallet credit`;

    await recordLoyaltyRedemption(adminSupabase, {
      customerId: user.id,
      points: validated.points,
      description: redemptionDescription,
      metadata: {
        source: "self_service_wallet_redeem",
        wallet_credit_amount: redemptionValue,
        currency,
      },
    });

    return successResponse({
      transaction: null,
      points_redeemed: validated.points,
      redemption_value: redemptionValue,
      currency,
      new_balance: Math.max(0, currentBalance - validated.points),
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
