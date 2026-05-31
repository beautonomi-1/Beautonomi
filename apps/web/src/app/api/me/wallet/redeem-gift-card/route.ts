import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const schema = z.object({
  code: z.string().min(1, "Gift card code is required"),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const body = schema.parse(await request.json());

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("preferred_home_tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    const tenantId = (userRow as { preferred_home_tenant_id?: string | null })?.preferred_home_tenant_id ?? null;
    const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
    const userCurrency = tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;

    // Verify Gift Card
    const codeUpper = body.code.trim().toUpperCase();
    const { data: giftCard, error: gcError } = await supabaseAdmin
      .from("gift_cards")
      .select("*")
      .eq("code", codeUpper)
      .single();

    if (gcError || !giftCard) {
      return errorResponse("Invalid or unrecognized gift card code", "INVALID_CODE", 400);
    }

    if (!giftCard.is_active) {
      return errorResponse("This gift card is inactive", "INACTIVE_CARD", 400);
    }

    if (giftCard.balance <= 0) {
      return errorResponse("This gift card has no remaining balance", "ZERO_BALANCE", 400);
    }

    if (giftCard.expires_at && new Date(giftCard.expires_at) < new Date()) {
      return errorResponse("This gift card has expired", "EXPIRED_CARD", 400);
    }

    if (giftCard.currency !== userCurrency) {
      return errorResponse(
        `This gift card is in ${giftCard.currency}, but your wallet is in ${userCurrency}. It can be redeemed by an account in the ${giftCard.currency} region, or used at checkout where ${giftCard.currency} is accepted.`,
        "CURRENCY_MISMATCH",
        400,
      );
    }

    const redeemAmount = Number(giftCard.balance);

    // Credit Wallet
    const walletTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
      tenant_id: tenantId,
      provider_id: null,
    });

    const { error: walletError } = await (supabaseAdmin.rpc as any)("wallet_credit_admin", {
      p_user_id: user.id,
      p_amount: redeemAmount,
      p_currency: userCurrency,
      p_description: `Gift card redemption: ${codeUpper}`,
      p_reference_id: giftCard.id,
      p_reference_type: "gift_card_redemption",
      p_tenant_id: walletTenantId,
    });

    if (walletError) {
      console.error("[redeem-gift-card] Failed to credit wallet:", walletError);
      return errorResponse("Failed to credit wallet. Please try again.", "WALLET_CREDIT_FAILED", 500);
    }

    // Record Redemption
    await supabaseAdmin.from("gift_card_redemptions").insert({
      gift_card_id: giftCard.id,
      user_id: user.id,
      amount: redeemAmount,
    });

    // Zero out Gift Card balance
    await supabaseAdmin
      .from("gift_cards")
      .update({ balance: 0 })
      .eq("id", giftCard.id);

    return successResponse({
      amount: redeemAmount,
      currency: userCurrency,
      message: "Gift card redeemed to wallet successfully",
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to redeem gift card");
  }
}
