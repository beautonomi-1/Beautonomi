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

    // §Gift-redeem (audit 2026-06): the previous order (credit wallet → then zero
    // balance, best-effort) allowed a double-redeem race — two concurrent requests
    // both read the same balance and both credited the wallet, and a failed
    // zero-out left the card reusable. We now ATOMICALLY claim the balance first
    // (zero it only while it still equals what we read), so exactly one request
    // can win. The wallet is credited only after a successful claim, and the
    // balance is restored if the credit fails so funds are never lost.
    const { data: claimedCard, error: claimError } = await supabaseAdmin
      .from("gift_cards")
      .update({ balance: 0 })
      .eq("id", giftCard.id)
      .eq("balance", redeemAmount)
      .gt("balance", 0)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("[redeem-gift-card] Failed to claim gift card balance:", claimError);
      return errorResponse("Failed to redeem gift card. Please try again.", "REDEEM_FAILED", 500);
    }
    if (!claimedCard) {
      // Another request redeemed/changed the balance between our read and claim.
      return errorResponse(
        "This gift card has already been redeemed or its balance changed. Please refresh and try again.",
        "ALREADY_REDEEMED",
        409,
      );
    }

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
      p_idempotency_key: `gift_card_redemption:${giftCard.id}`,
    });

    if (walletError) {
      console.error("[redeem-gift-card] Failed to credit wallet, restoring gift card balance:", walletError);
      // Roll back the claim so the customer does not lose the gift card value.
      const { error: restoreError } = await supabaseAdmin
        .from("gift_cards")
        .update({ balance: redeemAmount })
        .eq("id", giftCard.id);
      if (restoreError) {
        console.error("[redeem-gift-card] CRITICAL: failed to restore gift card balance after wallet credit failure:", restoreError);
      }
      return errorResponse("Failed to credit wallet. Please try again.", "WALLET_CREDIT_FAILED", 500);
    }

    // Record Redemption (booking_id is NULL — this is a wallet redemption, not a
    // booking redemption; migration 642 made booking_id nullable). Captured
    // immediately since the funds have already moved into the wallet.
    const { error: redemptionError } = await supabaseAdmin.from("gift_card_redemptions").insert({
      gift_card_id: giftCard.id,
      booking_id: null,
      user_id: user.id,
      amount: redeemAmount,
      currency: userCurrency,
      status: "captured",
      captured_at: new Date().toISOString(),
    });
    // The wallet was already credited, so a failed audit insert must not fail the
    // request — but log it loudly so the gap is visible in reconciliation.
    if (redemptionError) {
      console.error("[redeem-gift-card] Failed to record redemption audit row:", redemptionError);
    }

    // §Gift-liability (audit 2026-06): redeeming a gift card to the wallet moves
    // value from gift-card liability into wallet liability (tracked in
    // wallet_transactions). Post a gift_card_liability_reduction so the gift-card
    // liability is not left overstated. Idempotent in practice: the atomic balance
    // claim above guarantees redemption runs at most once per card.
    const { error: liabilityError } = await supabaseAdmin.from("finance_transactions").insert({
      booking_id: null,
      provider_id: null,
      tenant_id: walletTenantId,
      transaction_type: "gift_card_liability_reduction",
      amount: redeemAmount,
      fees: 0,
      commission: 0,
      net: -redeemAmount,
      description: `Gift card ${codeUpper} redeemed to wallet`,
      created_at: new Date().toISOString(),
    });
    if (liabilityError) {
      console.error(
        "[redeem-gift-card] Failed to record gift_card_liability_reduction:",
        liabilityError,
      );
    }

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
