import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { verifyGiftCardClaimToken } from "@/lib/gift-cards/gift-card-claim-token";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { trackGiftCardRedeemedServer } from "@/lib/gift-cards/track-gift-card-events";

/**
 * POST /api/public/gift-cards/claim
 * One-tap gift card accept from email link → wallet credit.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) {
      return errorResponse("token is required", "VALIDATION_ERROR", 400);
    }

    const parsed = verifyGiftCardClaimToken(token);
    if (!parsed) {
      return errorResponse("Invalid or expired gift link", "INVALID_TOKEN", 400);
    }

    const { user } = await requireRoleInApi(["customer"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const { data: giftCard } = await supabaseAdmin
      .from("gift_cards")
      .select("*")
      .eq("id", parsed.giftCardId)
      .maybeSingle();

    if (!giftCard?.id || giftCard.is_active === false || Number(giftCard.balance ?? 0) <= 0) {
      return errorResponse("This gift card is no longer available", "NOT_AVAILABLE", 400);
    }

    const userEmail = (user.email ?? "").trim().toLowerCase();
    if (userEmail !== parsed.recipientEmail.trim().toLowerCase()) {
      const { data: phoneRow } = await supabaseAdmin
        .from("users")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle();
      const userPhone = (phoneRow as { phone?: string | null } | null)?.phone ?? "";
      const tokenEmailIsSynthetic = parsed.recipientEmail.includes("@beautonomi.invalid");
      const meta = (giftCard.metadata as { recipient_phone?: string } | null) ?? {};
      const phoneMatches =
        tokenEmailIsSynthetic &&
        userPhone.trim().length > 0 &&
        typeof meta.recipient_phone === "string" &&
        meta.recipient_phone === userPhone;
      if (!phoneMatches) {
        return errorResponse(
          "Sign in with the email address that received this gift card.",
          "EMAIL_MISMATCH",
          403,
        );
      }
    }

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("preferred_home_tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    const tenantId = (userRow as { preferred_home_tenant_id?: string | null })?.preferred_home_tenant_id ?? null;
    const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
    const userCurrency = tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;

    if (giftCard.currency !== userCurrency) {
      return errorResponse("Currency mismatch for this gift card", "CURRENCY_MISMATCH", 400);
    }

    const redeemAmount = Number(giftCard.balance);
    const { data: claimedCard } = await supabaseAdmin
      .from("gift_cards")
      .update({ balance: 0 })
      .eq("id", giftCard.id)
      .eq("balance", redeemAmount)
      .gt("balance", 0)
      .select("id")
      .maybeSingle();

    if (!claimedCard?.id) {
      return errorResponse("This gift card was already redeemed", "ALREADY_REDEEMED", 409);
    }

    const walletTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
      tenant_id: giftCard.tenant_id ?? tenantId,
    });

    const { error: walletError } = await (supabaseAdmin.rpc as any)(
      "wallet_credit_admin",
      {
        p_user_id: user.id,
        p_amount: redeemAmount,
        p_currency: giftCard.currency || userCurrency,
        p_description: `Gift card ${giftCard.code} added to wallet`,
        p_reference_id: giftCard.id,
        p_reference_type: "gift_card_redeem",
        p_tenant_id: walletTenantId,
        p_idempotency_key: `gift_card_claim:${giftCard.id}:${user.id}`,
      },
    );

    if (walletError) {
      await supabaseAdmin
        .from("gift_cards")
        .update({ balance: redeemAmount })
        .eq("id", giftCard.id);
      return errorResponse("Could not credit wallet", "WALLET_ERROR", 500);
    }

    await supabaseAdmin
      .from("gift_cards")
      .update({
        metadata: {
          ...((giftCard.metadata as Record<string, unknown> | null) ?? {}),
          recipient_user_id: user.id,
          claimed_via_token_at: new Date().toISOString(),
        },
      })
      .eq("id", giftCard.id);

    // Server analytics (dedupes on gift card id + redemption type).
    void trackGiftCardRedeemedServer({
      giftCardId: giftCard.id,
      userId: user.id,
      amount: redeemAmount,
      currency: giftCard.currency || userCurrency,
      redemptionType: "wallet_claim_link",
    }).catch(() => undefined);

    return successResponse({ claimed: true, gift_card_id: giftCard.id, amount: redeemAmount });
  } catch (error) {
    return handleApiError(error, "Failed to claim gift card");
  }
}
