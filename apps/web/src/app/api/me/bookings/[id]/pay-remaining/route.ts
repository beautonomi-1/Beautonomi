import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { initializeOnlinePayment } from "@/lib/payments/online-payment";
import { resolveHostedCheckoutCallbacks } from "@/lib/payments/resolve-paystack-hosted-callback";
import {
  convertToSmallestUnit,
  generateTransactionReference,
} from "@/lib/payments/paystack";
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { applyCollectibleGiftAndWallet } from "@/lib/bookings/apply-collectible-gift-wallet";
import { recordCollectibleSettlementLedger } from "@/lib/bookings/record-collectible-settlement-ledger";
import { rollbackCollectibleSplitLeg } from "@/lib/bookings/rollback-collectible-split-leg";
import {
  completeWalletGiftSyntheticPayments,
} from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { getEffectiveCheckoutMethods } from "@/lib/payments/provider-checkout-methods";
import { z } from "zod";
import { normalizeTipPercentPresets } from "@beautonomi/utils";
import {
  extractIdempotencyKey,
  lookupIdempotentResponse,
  rememberIdempotentResponse,
} from "@/lib/http/idempotency";

const payRemainingBodySchema = z.object({
  callback_url: z.string().optional(),
  use_wallet: z.boolean().optional(),
  gift_card_code: z.string().optional(),
  tip_amount: z.number().nonnegative().optional(),
});

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadProviderTipSettings(
  providerId: string | null | undefined,
): Promise<{ tipsEnabled: boolean; tipPresets: number[] }> {
  if (!providerId) {
    return { tipsEnabled: true, tipPresets: normalizeTipPercentPresets(undefined) };
  }
  const { data } = await getSupabaseAdmin()
    .from("providers")
    .select("tips_enabled, tip_presets")
    .eq("id", providerId)
    .maybeSingle();
  const row = data as { tips_enabled?: boolean | null; tip_presets?: unknown } | null;
  return {
    tipsEnabled: row?.tips_enabled !== false,
    tipPresets: normalizeTipPercentPresets(row?.tip_presets),
  };
}

/**
 * GET /api/me/bookings/[id]/pay-remaining — preview balance and tip settings.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: bookingId } = await params;
    const { user } = await requireRoleInApi(["customer"], request);
    const supabase = await getSupabaseServer(request);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id, customer_id, provider_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, currency, tip_amount, platform_fee_amount, service_fee_amount",
      )
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const totalAmount = Number(booking.total_amount ?? 0);
    const remaining = computeBookingOutstandingDisplay({
      totalAmount,
      totalPaid: Number(booking.total_paid ?? 0),
      totalRefunded: Number((booking as { total_refunded?: number }).total_refunded ?? 0),
      walletAmount: Number((booking as { wallet_amount?: number }).wallet_amount ?? 0),
      giftCardAmount: Number((booking as { gift_card_amount?: number }).gift_card_amount ?? 0),
      unpaidAdditionalCharges: 0,
      paymentStatus: booking.payment_status,
    });

    const fee =
      Number((booking as { platform_fee_amount?: number }).platform_fee_amount ?? 0) ||
      Number((booking as { service_fee_amount?: number }).service_fee_amount ?? 0);
    const serviceTipBase = Math.max(
      0,
      totalAmount - Number((booking as { tip_amount?: number }).tip_amount ?? 0) - fee,
    );
    const { tipsEnabled, tipPresets } = await loadProviderTipSettings(
      (booking as { provider_id?: string | null }).provider_id,
    );

    return successResponse({
      remaining_balance: remaining,
      currency: booking.currency,
      tips_enabled: tipsEnabled,
      tip_presets: tipPresets,
      service_tip_base: roundMoney(serviceTipBase),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load pay-remaining preview");
  }
}

/**
 * POST /api/me/bookings/[id]/pay-remaining
 *
 * Settle outstanding booking balance with optional gift card + wallet split,
 * then Paystack for any remainder.
 * Webhook: `payment_type` = `booking_remaining` → handleBookingRemainingSuccess.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idempotencyKey = extractIdempotencyKey(request);
    const { id: bookingId } = await params;
    const idempotencyEndpoint = `me/bookings/${bookingId}/pay-remaining`;
    if (idempotencyKey) {
      const cached = await lookupIdempotentResponse(idempotencyEndpoint, idempotencyKey);
      if (cached) return cached.toResponse();
    }

    const { user } = await requireRoleInApi(["customer"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = payRemainingBodySchema.safeParse(rawBody);
    const body = parsedBody.success ? parsedBody.data : {};
    const callbackFromClient =
      typeof body.callback_url === "string" ? body.callback_url.trim() : "";
    const useWallet = body.use_wallet === true;
    const giftCardCode =
      typeof body.gift_card_code === "string" ? body.gift_card_code.trim() : "";

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id, customer_id, provider_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, currency, booking_number, ref_number, status, tenant_id, tip_amount, tax_amount, travel_fee, service_fee_amount, platform_fee_amount, additional_charges:additional_charges(id, amount, status)",
      )
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const tenantResolved = await resolvePaymentTenantForBookingRequest(
      request,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    if (tenantResolved.ok === false) {
      return tenantResolved.response;
    }
    const { paymentTenantId } = tenantResolved;
    const tenantRegion = await getTenantRegionConfig(paymentTenantId);

    const providerIdForGate = (booking as { provider_id?: string }).provider_id ?? "";
    if (providerIdForGate) {
      const methods = await getEffectiveCheckoutMethods({
        supabase: admin,
        tenantId: paymentTenantId,
        providerId: providerIdForGate,
      });
      if (!methods.online) {
        return errorResponse(
          "Online payments are not available for this provider",
          "FEATURE_DISABLED",
          400,
        );
      }
    }

    if (booking.status === "cancelled") {
      return errorResponse(
        "Cannot pay for a cancelled booking",
        "BOOKING_CANCELLED",
        400
      );
    }

    const totalAmount = Number(booking.total_amount ?? 0);
    const totalPaid = Number(booking.total_paid ?? 0);
    const totalRefunded = Number((booking as Record<string, unknown>).total_refunded ?? 0);
    const walletAmount = Number((booking as Record<string, unknown>).wallet_amount ?? 0);
    const giftCardAmount = Number((booking as Record<string, unknown>).gift_card_amount ?? 0);
    const remaining = computeBookingOutstandingDisplay({
      totalAmount,
      totalPaid,
      totalRefunded,
      walletAmount,
      giftCardAmount,
      unpaidAdditionalCharges: 0,
      paymentStatus: booking.payment_status,
    });

    const requestedTip = roundMoney(Number(body.tip_amount ?? 0));
    const feeForTip =
      Number((booking as { platform_fee_amount?: number }).platform_fee_amount ?? 0) ||
      Number((booking as { service_fee_amount?: number }).service_fee_amount ?? 0);
    const serviceTipBase = Math.max(
      0,
      totalAmount - Number((booking as { tip_amount?: number }).tip_amount ?? 0) - feeForTip,
    );
    const tipsEnabled =
      requestedTip > 0
        ? (
            await loadProviderTipSettings(
              (booking as { provider_id?: string | null }).provider_id,
            )
          ).tipsEnabled
        : true;

    if (requestedTip > 0 && !tipsEnabled) {
      return errorResponse("Tips are not enabled for this provider", "TIPS_DISABLED", 400);
    }
    if (requestedTip > serviceTipBase + 0.01) {
      return errorResponse("Tip amount is too large for this booking", "VALIDATION_ERROR", 400);
    }

    if (remaining <= 0 && requestedTip <= 0) {
      return errorResponse(
        "No remaining balance to pay",
        "NO_REMAINING_BALANCE",
        400
      );
    }

    const ps = booking.payment_status as string;
    if (ps !== "partially_paid" && ps !== "pending" && ps !== "partially_refunded") {
      return errorResponse(
        "Online payment is not available for this booking’s current payment state",
        "INVALID_STATUS",
        400
      );
    }

    const bookingNumber =
      booking.booking_number || booking.ref_number || bookingId.slice(0, 8).toUpperCase();
    const providerId = (booking as { provider_id?: string }).provider_id ?? "";

    const currency = booking.currency || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
    const reference = generateTransactionReference("remaining", bookingId);
    const paymentLegSuffix =
      useWallet || giftCardCode ? `:remaining:${reference}` : "";

    let walletAmountApplied = 0;
    let giftCardAmountApplied = 0;
    let paystackAmount = roundMoney(remaining + requestedTip);

    if (useWallet || giftCardCode) {
      const applied = await applyCollectibleGiftAndWallet({
        supabase,
        admin,
        customerId: user.id,
        bookingId,
        bookingNumber,
        providerId,
        tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
        currency,
        collectibleAmount: remaining,
        useWallet,
        giftCardCode: giftCardCode || null,
        walletDescription: `Wallet spend (remaining balance) for booking ${bookingNumber}`,
        paymentLegSuffix,
      });
      if (applied.ok === false) {
        return errorResponse(applied.error, applied.code ?? "SPLIT_ERROR", 400);
      }
      walletAmountApplied = applied.walletAmountApplied;
      giftCardAmountApplied = applied.giftCardAmountApplied;
      paystackAmount = roundMoney(applied.paystackAmount + requestedTip);

      if (applied.fullySettled && requestedTip <= 0) {
        try {
          if (giftCardAmountApplied > 0) {
            await (admin.rpc as any)("capture_gift_card_redemption", { p_booking_id: bookingId });
          }
          await completeWalletGiftSyntheticPayments(admin, bookingId);
          await recordCollectibleSettlementLedger(admin, {
            bookingId,
            providerId,
            tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
            bookingNumber,
            bookingTotal: totalAmount,
            tipAmount: Number((booking as { tip_amount?: number }).tip_amount ?? 0),
            taxAmount: Number((booking as { tax_amount?: number }).tax_amount ?? 0),
            travelFee: Number((booking as { travel_fee?: number }).travel_fee ?? 0),
            serviceFeeAmount: Number(
              (booking as { service_fee_amount?: number; platform_fee_amount?: number })
                .service_fee_amount ??
                (booking as { platform_fee_amount?: number }).platform_fee_amount ??
                0,
            ),
            collectibleAmount: remaining,
            walletAmountApplied,
            giftCardAmountApplied,
            idempotencyReference: reference,
            settlementLabel: "Remaining balance (wallet/gift)",
          });
          await syncBookingAfterPaystackSuccess(admin, bookingId, {
            paymentProvider: walletAmountApplied > 0 ? "wallet" : "gift_card",
          });
          const fullySettledBody = {
            authorization_url: "",
            access_code: "",
            reference,
            wallet_amount_applied: walletAmountApplied,
            gift_card_amount_applied: giftCardAmountApplied,
            paystack_amount: 0,
            fully_settled: true,
            message: "Remaining balance paid from wallet and gift card.",
          };
          if (idempotencyKey) {
            await rememberIdempotentResponse(idempotencyEndpoint, idempotencyKey, {
              status: 200,
              body: fullySettledBody,
            });
          }
          return successResponse(fullySettledBody);
        } catch (settleErr) {
          if (paymentLegSuffix && (walletAmountApplied > 0 || giftCardAmountApplied > 0)) {
            await rollbackCollectibleSplitLeg(admin, {
              bookingId,
              customerId: user.id,
              currency,
              tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
              providerId,
              walletAmountToReverse: walletAmountApplied,
              giftCardAmountToReverse: giftCardAmountApplied,
              paymentLegSuffix,
              idempotencyKey: `pay_remaining_rollback:${reference}`,
            });
          }
          throw settleErr;
        }
      }

      if (applied.fullySettled && requestedTip > 0) {
        paystackAmount = requestedTip;
        walletAmountApplied = applied.walletAmountApplied;
        giftCardAmountApplied = applied.giftCardAmountApplied;
      }
    }

    const { data: customer } = await supabase
      .from("users")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    if (!customer?.email) {
      return errorResponse(
        "Customer email is required for payment",
        "MISSING_EMAIL",
        400
      );
    }

    const amountInSmallestUnit = convertToSmallestUnit(paystackAmount, currency);

    const remainingAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(/\/$/, "");
    const hostedRemaining = resolveHostedCheckoutCallbacks({
      baseUrl: remainingAppUrl,
      clientCallbackUrl: callbackFromClient,
      defaultSuccessPath: `/account-settings/bookings/${bookingId}/payment-callback`,
      defaultCancelPath: `/account-settings/bookings/${bookingId}`,
      query: { pay_remaining: "1" },
    });
    const remainingCallbackUrl = hostedRemaining.successUrl;
    const remainingCancelAction = `${hostedRemaining.cancelUrl}${hostedRemaining.cancelUrl.includes("?") ? "&" : "?"}pay_remaining_cancelled=1`;

    let onlineInit: Awaited<ReturnType<typeof initializeOnlinePayment>>;
    try {
      onlineInit = await initializeOnlinePayment({
        tenantId: paymentTenantId,
        email: customer.email,
        amountInSmallestUnit,
        currency,
        reference,
        callbackUrl: remainingCallbackUrl,
        lineItemName: `Booking ${bookingNumber || bookingId} — remaining balance`,
        metadata: {
          booking_id: bookingId,
          booking_number: bookingNumber,
          customer_id: user.id,
          payment_type: "booking_remaining",
          cancel_action: remainingCancelAction,
          wallet_amount_applied: walletAmountApplied,
          gift_card_amount_applied: giftCardAmountApplied,
          tip_amount: requestedTip,
          balance_amount: remaining,
        },
      });
    } catch (initErr) {
      if (paymentLegSuffix && (walletAmountApplied > 0 || giftCardAmountApplied > 0)) {
        await rollbackCollectibleSplitLeg(admin, {
          bookingId,
          customerId: user.id,
          currency,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
          providerId,
          walletAmountToReverse: walletAmountApplied,
          giftCardAmountToReverse: giftCardAmountApplied,
          paymentLegSuffix,
          idempotencyKey: `pay_remaining_rollback:${reference}`,
        });
      }
      throw initErr;
    }

    if (!onlineInit.authorizationUrl) {
      if (paymentLegSuffix && (walletAmountApplied > 0 || giftCardAmountApplied > 0)) {
        await rollbackCollectibleSplitLeg(admin, {
          bookingId,
          customerId: user.id,
          currency,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
          providerId,
          walletAmountToReverse: walletAmountApplied,
          giftCardAmountToReverse: giftCardAmountApplied,
          paymentLegSuffix,
          idempotencyKey: `pay_remaining_rollback:${reference}`,
        });
      }
      throw new Error("Failed to generate payment link");
    }

    // verifyBookingCharge (webhook + verify-reference) only accepts a charge that
    // matches a server-issued pending `payments` row for this reference.
    const { error: pendingInsertError } = await (admin.from("payments") as any).insert({
      booking_id: bookingId,
      user_id: user.id,
      provider_id: providerId || null,
      payment_number: "",
      amount: paystackAmount,
      currency,
      status: "pending",
      payment_provider: onlineInit.provider,
      payment_provider_transaction_id: reference,
      payment_provider_response: onlineInit,
      description: `Remaining balance for booking ${bookingNumber}`,
      metadata: {
        type: "booking_remaining",
        wallet_amount_applied: walletAmountApplied,
        gift_card_amount_applied: giftCardAmountApplied,
        tip_amount: requestedTip,
        balance_amount: remaining,
      },
    });
    if (pendingInsertError) {
      if (paymentLegSuffix && (walletAmountApplied > 0 || giftCardAmountApplied > 0)) {
        await rollbackCollectibleSplitLeg(admin, {
          bookingId,
          customerId: user.id,
          currency,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
          providerId,
          walletAmountToReverse: walletAmountApplied,
          giftCardAmountToReverse: giftCardAmountApplied,
          paymentLegSuffix,
          idempotencyKey: `pay_remaining_rollback:${reference}`,
        });
      }
      throw new Error(`Failed to record pending payment: ${pendingInsertError.message}`);
    }

    const payRemainingBody = {
      authorization_url: onlineInit.authorizationUrl ?? "",
      access_code: onlineInit.accessCode ?? "",
      reference,
      wallet_amount_applied: walletAmountApplied,
      gift_card_amount_applied: giftCardAmountApplied,
      paystack_amount: paystackAmount,
      fully_settled: false,
    };
    if (idempotencyKey) {
      await rememberIdempotentResponse(idempotencyEndpoint, idempotencyKey, {
        status: 200,
        body: payRemainingBody,
      });
    }
    return successResponse(payRemainingBody);
  } catch (error) {
    return handleApiError(error, "Failed to initiate pay remaining balance");
  }
}
