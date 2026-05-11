import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { chargeAuthorization } from "@/lib/payments/paystack-complete";
import { computeCustomOfferPricing } from "./custom-offer-pricing";
import { computeCustomOfferSplits } from "./custom-offer-splits";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { toCents, percentOf } from "@beautonomi/utils";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";
import { finalizeCustomOfferPayment } from "@/lib/custom-offers/finalize-custom-offer-payment";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import {
  isWalletEnabledForTenant,
  isGiftCardsEnabledForTenant,
} from "@/lib/subscriptions/entitlements";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

interface OfferRow {
  id: string;
  status?: string;
  payment_url?: string;
  expiration_at?: string;
  travel_fee?: number;
  price?: number;
  currency?: string;
  request_id?: string;
  location_id?: string | null;
  request?: RequestRow | null;
}
interface RequestRow {
  id: string;
  customer_id?: string;
  provider_id?: string;
  preferred_start_at?: string;
  location_type?: string;
  status?: string;
}

async function notifyCustomerCustomOfferExpiredBestEffort(args: {
  customerId: string;
  providerId?: string;
  offerId: string;
  requestId?: string;
}): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    let providerName = "your provider";
    if (args.providerId) {
      const admin = getSupabaseAdmin();
      const { data: prow } = await admin
        .from("providers")
        .select("business_name")
        .eq("id", args.providerId)
        .maybeSingle();
      const bn = (prow as { business_name?: string } | null)?.business_name;
      if (bn && bn.trim()) providerName = bn.trim();
    }
    await sendTemplateNotification(
      "customer_custom_offer_expired",
      [args.customerId],
      {
        provider_name: providerName,
        offer_id: args.offerId,
        request_id: args.requestId ?? "",
      },
      ["push", "email"],
      { appType: "customer" },
    );
  } catch (e) {
    console.warn("[accept/expire] notify customer failed:", e);
  }
}

/**
 * Shared handler for `POST /api/me/custom-offers/:id/accept` and `POST .../pay`.
 * (Wallet / gift / loyalty splits land here when `commerce.custom_offer_full_checkout` is enabled.)
 */
export async function postCustomOfferAccept(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  auth?: Awaited<ReturnType<typeof requireRoleInApi>>,
) {
  try {
    const { user } = auth ?? (await requireRoleInApi(["customer", "superadmin"], request));
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { id } = await params;

    let body: {
      tip_amount?: number;
      promotion_code?: string;
      payment_option?: "full" | "deposit";
      payment_method_id?: string;
      callback_url?: string;
      /** Full-checkout split-tender inputs (gated on `commerce.custom_offer_full_checkout`). */
      use_wallet?: boolean;
      gift_card_code?: string;
      loyalty_points_to_redeem?: number;
    } = {};
    try {
      body = (await request.json()) || {};
    } catch {
      // no body
    }

    const { data: offerRow, error: offerError } = await supabase
      .from("custom_offers")
      .select(
        "*, request:custom_requests(id, customer_id, provider_id, preferred_start_at, location_type, status)",
      )
      .eq("id", id)
      .single();
    if (offerError || !offerRow) return notFoundResponse("Offer not found");

    const offer = offerRow as OfferRow;
    const req = offer.request as RequestRow | undefined;
    if (req?.customer_id !== user.id) return notFoundResponse("Offer not found");

    const requestStatus = req?.status;
    if (
      requestStatus === "cancelled" ||
      requestStatus === "fulfilled" ||
      requestStatus === "expired"
    ) {
      return errorResponse(
        "This request is closed. You can no longer pay for this offer.",
        "REQUEST_CLOSED",
        400,
      );
    }

    if (req?.provider_id) {
      const { data: provRow } = await supabase
        .from("providers")
        .select("tenant_id")
        .eq("id", req.provider_id)
        .maybeSingle();
      if (
        !resourceTenantMatchesHostTenant(
          tenantId,
          (provRow as { tenant_id?: string | null } | null)?.tenant_id,
        )
      ) {
        return errorResponse(
          "This offer belongs to a different market. Switch to the correct site or app to pay.",
          "TENANT_MISMATCH",
          403,
        );
      }
    }

    if (offer.status === "paid" || offer.status === "accepted") {
      return successResponse({ paymentUrl: offer.payment_url, alreadyAccepted: true });
    }

    if (offer.status === "declined") {
      return errorResponse("This offer was declined.", "OFFER_DECLINED", 400);
    }

    if (offer.status === "expired") {
      return errorResponse("This offer has expired.", "OFFER_EXPIRED", 410);
    }

    if (offer.status === "finalize_failed") {
      return errorResponse(
        "Payment was received but we could not finish creating your booking. Please contact support with your payment reference.",
        "OFFER_FINALIZE_FAILED",
        409,
      );
    }

    if (offer.status === "payment_pending" && offer.payment_url) {
      if (offer.expiration_at && new Date(offer.expiration_at).getTime() < Date.now()) {
        const adminEarly = getSupabaseAdmin();
        await adminEarly.from("custom_offers").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", id);
        await patchCustomOfferMessageAttachments(adminEarly, id, { status: "expired" });
        void notifyCustomerCustomOfferExpiredBestEffort({
          customerId: user.id,
          providerId: req?.provider_id,
          offerId: id,
          requestId: req?.id,
        });
        return errorResponse("This offer has expired.", "OFFER_EXPIRED", 410);
      }
      return successResponse({ paymentUrl: offer.payment_url, alreadyAccepted: false });
    }

    const adminSupabase = getSupabaseAdmin();

    if (offer.expiration_at && new Date(offer.expiration_at).getTime() < Date.now()) {
      await adminSupabase.from("custom_offers").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", id);
      await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "expired" });
      void notifyCustomerCustomOfferExpiredBestEffort({
        customerId: user.id,
        providerId: req?.provider_id,
        offerId: id,
        requestId: req?.id,
      });
      return errorResponse("This offer has expired.", "OFFER_EXPIRED", 410);
    }

    if (offer.status === "withdrawn") {
      return errorResponse("This offer has been withdrawn.", "OFFER_WITHDRAWN", 400);
    }

    const travelFee = Number(offer.travel_fee ?? 0) >= 0 ? Number(offer.travel_fee ?? 0) : 0;
    const pricing = await computeCustomOfferPricing(supabase, {
      offerPrice: Number(offer.price || 0),
      travelFee,
      currency: offer.currency || lastResortCurrency,
      providerId: req?.provider_id ?? "",
      customerId: req?.customer_id ?? "",
      tipAmount: body.tip_amount,
      promotionCode: body.promotion_code ?? null,
      locationType: req?.location_type === "at_home" ? "at_home" : "at_salon",
      locationId: offer.location_id ?? null,
    });

    if (pricing.ok === false) {
      return handleApiError(new Error(pricing.error), pricing.error);
    }

    const { result } = pricing;

    const { data: providerRow } = await supabase
      .from("providers")
      .select("requires_deposit, deposit_percentage")
      .eq("id", req?.provider_id ?? "")
      .maybeSingle();

    const providerRequiresDeposit = Boolean((providerRow as any)?.requires_deposit);
    const depositPct = Number((providerRow as any)?.deposit_percentage || 30);
    const paymentOption = providerRequiresDeposit && body.payment_option === "deposit" ? "deposit" : "full";
    const depositAmount = providerRequiresDeposit ? percentOf(result.totalAmount, depositPct) : 0;
    const chargeAmount = paymentOption === "deposit" ? depositAmount : result.totalAmount;

    // ── Split-tender preview (wallet / gift card / loyalty) ────────────────────
    // Mirrors booking checkout. Gated on `commerce.custom_offer_full_checkout` so
    // we can roll out incrementally per market. The actual gift-card reservation
    // and wallet debit happen below — split preview is just a math step here.
    const fullCheckoutEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.CUSTOM_OFFER_FULL_CHECKOUT,
      tenantId,
    );

    let walletAmount = 0;
    let giftCardAmount = 0;
    let giftCardId: string | null = null;
    let giftCardCode: string | null = null;
    let loyaltyPointsRedeemed = 0;
    let loyaltyDiscountAmount = 0;
    let amountToCollect = chargeAmount;

    if (
      fullCheckoutEnabled &&
      (body.use_wallet || body.gift_card_code || (body.loyalty_points_to_redeem ?? 0) > 0)
    ) {
      if (body.use_wallet && !(await isWalletEnabledForTenant(tenantId))) {
        return errorResponse(
          "Wallet payments are currently unavailable.",
          "FEATURE_DISABLED",
          400,
        );
      }
      if (body.gift_card_code && !(await isGiftCardsEnabledForTenant(tenantId))) {
        return errorResponse(
          "Gift cards are currently unavailable.",
          "FEATURE_DISABLED",
          400,
        );
      }

      const splits = await computeCustomOfferSplits(supabase, {
        collectibleAmount: chargeAmount,
        bookingSubtotal: result.subtotal,
        customerId: user.id,
        currency: offer.currency || lastResortCurrency,
        useWallet: Boolean(body.use_wallet),
        giftCardCode: body.gift_card_code ?? null,
        loyaltyPointsToRedeem: body.loyalty_points_to_redeem ?? 0,
      });

      if (splits.ok === false) {
        return errorResponse(splits.error, splits.code ?? "SPLIT_ERROR", 400);
      }
      walletAmount = splits.result.walletAmount;
      giftCardAmount = splits.result.giftCardAmount;
      giftCardId = splits.result.giftCardId;
      giftCardCode = body.gift_card_code ? body.gift_card_code.trim().toUpperCase() : null;
      loyaltyPointsRedeemed = splits.result.loyaltyPointsRedeemed;
      loyaltyDiscountAmount = splits.result.loyaltyDiscountAmount;
      amountToCollect = splits.result.paystackAmount;
    }

    const reference = `co_${id}_${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com";
    const webSuccessUrl = `${appUrl}/checkout/success?payment_type=custom_offer&offer_id=${encodeURIComponent(id)}`;
    const rawCallback =
      typeof body.callback_url === "string" && body.callback_url.trim().length > 0
        ? body.callback_url.trim()
        : "";
    const callbackUrl =
      rawCallback.length > 0 && rawCallback.length <= 2048 ? rawCallback : webSuccessUrl;

    const email = (user as { email?: string }).email ?? "customer@example.com";

    // Pricing metadata that finalize uses to write booking + ledger rows.
    const pricingMetadata: Record<string, unknown> = {
      custom_offer_id: id,
      custom_request_id: offer.request_id,
      tip_amount: result.tipAmount,
      tax_amount: result.taxAmount,
      tax_rate: result.taxRate,
      travel_fee: result.travelFee,
      service_fee_amount: result.serviceFeeAmount,
      service_fee_percentage: result.serviceFeePercentage,
      promotion_id: result.promotionId ?? "",
      promotion_discount_amount: result.promotionDiscountAmount,
      commission_base: result.commissionBase,
      payment_option: paymentOption,
      total_amount: result.totalAmount,
      deposit_amount: paymentOption === "deposit" ? chargeAmount : 0,
      deposit_percentage: providerRequiresDeposit ? depositPct : 0,
      requires_deposit: providerRequiresDeposit,
      wallet_amount_applied: walletAmount,
      gift_card_amount_applied: giftCardAmount,
      gift_card_id: giftCardId,
      gift_card_code: giftCardCode,
      loyalty_points_used: loyaltyPointsRedeemed,
      loyalty_discount_amount: loyaltyDiscountAmount,
    };

    // ── Debit wallet UPFRONT (mirrors booking checkout) ──────────────────────
    // Wallet debit runs under the customer's auth context (`wallet_debit_self`
    // uses auth.uid() to lock the user_wallets row), so we use `supabase`,
    // not the admin client. If Paystack init / saved-card charge later fails,
    // we credit it back via `wallet_credit_self`.
    //
    // Gift card reservation is deferred to the finalize step. The current
    // `reserve_gift_card_redemption` RPC requires a booking_id (custom offers
    // don't have one until finalize creates the booking). We validate balance
    // here for the pricing preview; the actual reserve+capture happens inside
    // `finalizeCustomOfferPayment` once the booking row exists.
    const reservedRollbacks: Array<() => Promise<void>> = [];

    if (walletAmount > 0) {
      try {
        const walletLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: null,
          provider_id: req?.provider_id ?? null,
        });
        const { error: walletErr } = await (supabase.rpc as any)("wallet_debit_self", {
          p_amount: walletAmount,
          p_description: `Wallet spend for custom offer ${id}`,
          p_reference_id: id,
          p_reference_type: "custom_offer",
          p_tenant_id: walletLedgerTenantId,
        });
        if (walletErr) {
          return errorResponse(walletErr.message || "Wallet debit failed.", "WALLET_ERROR", 400);
        }
        reservedRollbacks.push(async () => {
          try {
            await (supabase.rpc as any)("wallet_credit_self", {
              p_amount: walletAmount,
              p_description: `Refund wallet (custom offer ${id} aborted)`,
              p_reference_id: id,
              p_reference_type: "custom_offer_refund",
              p_tenant_id: walletLedgerTenantId,
            });
          } catch {
            /* best-effort refund */
          }
        });
      } catch (walletErr: any) {
        return errorResponse(
          walletErr?.message || "Wallet debit failed.",
          "WALLET_ERROR",
          400,
        );
      }
    }

    // ── Zero-Paystack path (wallet + gift fully cover the collectible) ─────
    if (amountToCollect <= 0) {
      const finalizeRef = `co_split_${id}_${Date.now()}`;
      const finalize = await finalizeCustomOfferPayment(adminSupabase, {
        offerId: id,
        reference: finalizeRef,
        paystackAmountMajor: 0,
        paystackFeesMajor: 0,
        walletAmountApplied: walletAmount,
        giftCardAmountApplied: giftCardAmount,
        giftCardId,
        giftCardCode,
        loyaltyPointsRedeemed,
        loyaltyDiscountAmount,
        pricingMetadata,
        customerEmail: (user as { email?: string }).email ?? null,
        paymentProvider:
          walletAmount > 0 && giftCardAmount > 0
            ? "split"
            : walletAmount > 0
              ? "wallet"
              : "gift_card",
      });
      if (!finalize.ok) {
        // Refund tenders since no paystack call happened and finalize couldn't write.
        for (const rb of reservedRollbacks) await rb();
        return errorResponse(
          "We could not finalize your booking. Your wallet/gift card has been refunded — please try again or contact support.",
          "FINALIZE_FAILED",
          500,
        );
      }
      return successResponse({
        charged: true,
        finalized: true,
        reference: finalizeRef,
        booking_id: finalize.bookingId ?? null,
        deposit_required: providerRequiresDeposit,
        deposit_percentage: providerRequiresDeposit ? depositPct : 0,
        deposit_amount: paymentOption === "deposit" ? chargeAmount : 0,
        payment_option: paymentOption,
        total_amount: result.totalAmount,
        wallet_amount_applied: walletAmount,
        gift_card_amount_applied: giftCardAmount,
        loyalty_points_used: loyaltyPointsRedeemed,
        loyalty_discount_amount: loyaltyDiscountAmount,
        paystack_amount: 0,
      });
    }

    const amountKobo = toCents(amountToCollect);

    if (body.payment_method_id) {
      const { data: paymentMethod, error: pmError } = await (supabase
        .from("payment_methods") as any)
        .select("*")
        .eq("id", body.payment_method_id)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .eq("provider", "paystack")
        .single();

      if (pmError || !paymentMethod) {
        for (const rb of reservedRollbacks) await rb();
        return errorResponse("Payment method not found.", "NOT_FOUND", 404);
      }

      const authorizationCode = paymentMethod.provider_payment_method_id as string | undefined;
      if (!authorizationCode || !authorizationCode.startsWith("AUTH_")) {
        for (const rb of reservedRollbacks) await rb();
        return errorResponse("This payment method is not a valid Paystack authorization.", "INVALID_METHOD", 400);
      }

      const { error: pendingErr } = await adminSupabase
        .from("custom_offers")
        .update({
          status: "payment_pending",
          payment_reference: reference,
          payment_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (pendingErr) {
        for (const rb of reservedRollbacks) await rb();
        return handleApiError(new Error("Failed to save payment state"), "Unable to process payment.", "DB_ERROR", 500);
      }

      await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "payment_pending" });

      const chargeResult = await chargeAuthorization(
        authorizationCode,
        email,
        amountKobo,
        pricingMetadata,
        { tenantId },
      );

      if (!chargeResult.status) {
        for (const rb of reservedRollbacks) await rb();
        await adminSupabase
          .from("custom_offers")
          .update({
            status: "pending",
            payment_url: null,
            payment_reference: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "pending" });
        return errorResponse(chargeResult.message || "Failed to charge card", "CHARGE_FAILED", 400);
      }

      return successResponse({
        charged: true,
        reference: chargeResult.data?.reference ?? reference,
        deposit_required: providerRequiresDeposit,
        deposit_percentage: providerRequiresDeposit ? depositPct : 0,
        deposit_amount: paymentOption === "deposit" ? chargeAmount : 0,
        payment_option: paymentOption,
        total_amount: result.totalAmount,
        wallet_amount_applied: walletAmount,
        gift_card_amount_applied: giftCardAmount,
        loyalty_points_used: loyaltyPointsRedeemed,
        loyalty_discount_amount: loyaltyDiscountAmount,
        paystack_amount: amountToCollect,
      });
    }

    let init;
    try {
      init = await initializePaystackTransaction({
        email,
        amountInSmallestUnit: amountKobo,
        currency: offer.currency || lastResortCurrency,
        reference,
        callback_url: callbackUrl,
        metadata: pricingMetadata,
        tenantId,
      });
    } catch (initErr) {
      for (const rb of reservedRollbacks) await rb();
      console.error("[custom-offers/pay] initializePaystackTransaction failed:", initErr);
      return errorResponse(
        "Payment provider is temporarily unavailable. Please try again in a moment.",
        "PAYMENT_INIT_FAILED",
        502,
      );
    }

    const paymentUrl = init.data.authorization_url;

    const { error: updateError } = await adminSupabase.from("custom_offers").update({
      status: "payment_pending",
      payment_reference: reference,
      payment_url: paymentUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (updateError) {
      for (const rb of reservedRollbacks) await rb();
      console.error("[custom-offers/accept] failed to persist payment_pending:", updateError.message);
      return handleApiError(new Error("Failed to save payment state"), "Unable to process payment. Please try again.", "DB_ERROR", 500);
    }

    await patchCustomOfferMessageAttachments(adminSupabase, id, { status: "payment_pending" });

    return successResponse({
      paymentUrl,
      deposit_required: providerRequiresDeposit,
      deposit_percentage: providerRequiresDeposit ? depositPct : 0,
      deposit_amount: paymentOption === "deposit" ? chargeAmount : 0,
      payment_option: paymentOption,
      total_amount: result.totalAmount,
      wallet_amount_applied: walletAmount,
      gift_card_amount_applied: giftCardAmount,
      loyalty_points_used: loyaltyPointsRedeemed,
      loyalty_discount_amount: loyaltyDiscountAmount,
      paystack_amount: amountToCollect,
    });
  } catch (error) {
    return handleApiError(error, "Failed to accept offer");
  }
}
