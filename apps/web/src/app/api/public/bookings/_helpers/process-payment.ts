import { SupabaseClient } from "@supabase/supabase-js";
import { handleApiError } from "@/lib/supabase/api-helpers";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { chargeAuthorization } from "@/lib/payments/paystack-complete";
import { getAppointmentSettingsFromDB } from "@/lib/provider-portal/appointment-settings";
import type { BookingDraft } from "@/types/beautonomi";
import type { ValidatedBookingData } from "./validate-booking";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PaymentResult {
  paymentUrl: string | null;
}

export interface ProcessPaymentInput {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  draft: BookingDraft;
  validatedDraft: Record<string, any>;
  v: ValidatedBookingData;
  booking: any;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Process the payment for a booking.
 *
 * Handles: deposit calculation, gift card reservation, wallet debit,
 * Paystack card payment (new or saved), and cash-payment bookings.
 *
 * Returns either a `PaymentResult` or a NextResponse error.
 */
export async function processPayment(
  input: ProcessPaymentInput
): Promise<PaymentResult | Response> {
  const { supabase, supabaseAdmin, draft, validatedDraft, v, booking } = input;

  const paymentMethod = validatedDraft.payment_method || "card";
  const paymentOption = validatedDraft.payment_option || "deposit";

  // ── Determine amount to collect ──────────────────────────────────────────
  let amountToCollect = v.totalAmount;
  if (v.provider.requires_deposit) {
    const pct = Number(v.provider.deposit_percentage || 30);
    const deposit = Math.ceil((v.totalAmount * pct) / 100);
    amountToCollect = paymentOption === "full" ? v.totalAmount : deposit;
  }

  // ── Gift card reservation ────────────────────────────────────────────────
  const giftCardCode = (validatedDraft.gift_card_code || "").toString().trim().toUpperCase();
  let giftCardAmountApplied = 0;
  let giftCardId: string | null = null;

  if (giftCardCode && amountToCollect > 0) {
    const applyAmount = Math.max(0, amountToCollect);
    if (applyAmount > 0) {
      const { data: reserved, error: reserveError } = await (supabase.rpc as any)(
        "reserve_gift_card_redemption",
        {
          p_code: giftCardCode,
          p_amount: applyAmount,
          p_booking_id: booking.id,
          p_currency: v.currency,
        }
      );

      if (reserveError) {
        return handleApiError(
          reserveError,
          reserveError.message || "Invalid gift card",
          "GIFT_CARD_INVALID",
          400
        );
      }

      const row = Array.isArray(reserved) ? reserved[0] : reserved;
      giftCardId = row?.gift_card_id || null;
      giftCardAmountApplied = applyAmount;

      await (supabase.from("bookings") as any)
        .update({
          gift_card_id: giftCardId,
          gift_card_amount: giftCardAmountApplied,
        })
        .eq("id", booking.id);

      amountToCollect = Math.max(0, amountToCollect - giftCardAmountApplied);
    }
  }

  // Capture gift card immediately if no card payment or nothing left
  if (giftCardAmountApplied > 0 && (paymentMethod !== "card" || amountToCollect <= 0)) {
    await (supabase.rpc as any)("capture_gift_card_redemption", { p_booking_id: booking.id });
  }

  // ── Wallet application ───────────────────────────────────────────────────
  const useWallet = Boolean(validatedDraft.use_wallet);
  let walletAmountApplied = 0;

  if (useWallet && amountToCollect > 0) {
    try {
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("balance, currency")
        .eq("user_id", v.customerId)
        .maybeSingle();

      const walletBalance = Number((wallet as any)?.balance || 0);
      if (walletBalance > 0) {
        walletAmountApplied = Math.min(walletBalance, amountToCollect);

        await (supabase.rpc as any)("wallet_debit_self", {
          p_amount: walletAmountApplied,
          p_description: `Wallet spend for booking ${booking.booking_number}`,
          p_reference_id: booking.id,
          p_reference_type: "booking",
        });

        await (supabase.from("bookings") as any)
          .update({ wallet_amount: walletAmountApplied })
          .eq("id", booking.id);

        amountToCollect = Math.max(0, amountToCollect - walletAmountApplied);
      }
    } catch (e: any) {
      return handleApiError(e, e?.message || "Wallet payment failed", "WALLET_ERROR", 400);
    }
  }

  // ── Fully covered by gift card / wallet → mark paid immediately ──────────
  if (amountToCollect <= 0) {
    const appointmentSettings = await getAppointmentSettingsFromDB(
      supabaseAdmin,
      draft.provider_id
    );
    const shouldAutoConfirmStatus = !appointmentSettings.requireConfirmationForBookings;

    await (supabase.from("bookings") as any)
      .update({
        payment_status: "paid",
        payment_provider: walletAmountApplied > 0 ? "wallet" : "gift_card",
        payment_date: new Date().toISOString(),
        status: shouldAutoConfirmStatus ? "confirmed" : "pending",
      })
      .eq("id", booking.id);

    // ── Ledger entries (no gateway fees) ─────────────────────────────────
    await insertNoGatewayLedger(supabase, {
      booking,
      draft,
      v,
      giftCardAmountApplied,
      giftCardCode,
      walletAmountApplied,
    });

    return { paymentUrl: null };
  }

  // ── Card payment ─────────────────────────────────────────────────────────
  let paymentUrl: string | null = null;

  if (paymentMethod === "card") {
    const { data: userEmailRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", v.customerId)
      .single();

    const email = userEmailRow?.email;
    if (!email) {
      return handleApiError(
        new Error("User email is required for payment"),
        "User email is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const reference = generateTransactionReference("booking", booking.id);
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success`;

    const savedPaymentMethodId = (draft as any).payment_method_id;
    const saveCard = (draft as any).save_card === true;
    const setAsDefault = (draft as any).set_as_default === true;

    if (savedPaymentMethodId) {
      // ── Saved card charge ──────────────────────────────────────────────
      const { data: savedCard, error: cardError } = await (supabase.from("payment_methods") as any)
        .select("*")
        .eq("id", savedPaymentMethodId)
        .eq("user_id", v.customerId)
        .eq("is_active", true)
        .eq("provider", "paystack")
        .single();

      if (cardError || !savedCard) {
        return handleApiError(
          new Error("Saved payment method not found"),
          "Saved payment method not found or invalid",
          "NOT_FOUND",
          404
        );
      }

      const chargeResult = await chargeAuthorization(
        savedCard.provider_payment_method_id,
        email,
        convertToSmallestUnit(amountToCollect),
        {
          booking_id: booking.id,
          customer_id: v.customerId,
          amount_to_collect: amountToCollect,
          gift_card_amount_applied: giftCardAmountApplied,
          gift_card_code: giftCardCode || null,
          wallet_amount_applied: walletAmountApplied,
          currency: v.currency,
          tip_amount: v.tipAmount,
          tax_amount: v.taxAmount,
          travel_fee: v.travelFee,
          service_fee_amount: v.serviceFeeAmount,
          service_fee_percentage: v.serviceFeePercentage,
          commission_base: v.commissionBase,
          payment_method_id: savedPaymentMethodId,
          hold_id: validatedDraft.hold_id || null,
        }
      );

      if (!chargeResult.status) {
        return handleApiError(
          new Error(chargeResult.message || "Payment failed"),
          "Failed to charge saved card",
          "PAYMENT_FAILED",
          400
        );
      }

      paymentUrl = null;

      await (supabase.from("bookings") as any)
        .update({
          payment_reference: chargeResult.data.reference,
          payment_provider: "paystack",
          payment_status: "pending",
        })
        .eq("id", booking.id);

      await (supabase.from("payments") as any).insert({
        booking_id: booking.id,
        user_id: v.customerId,
        provider_id: draft.provider_id,
        payment_number: "",
        amount: amountToCollect,
        currency: v.currency,
        status: "pending",
        payment_provider: "paystack",
        payment_provider_transaction_id: chargeResult.data.reference,
        payment_provider_response: chargeResult,
        payment_method_id: savedPaymentMethodId,
        description: `Payment for booking ${booking.booking_number}`,
        metadata: {
          payment_option: v.provider.requires_deposit ? paymentOption : "full",
          gift_card_amount_applied: giftCardAmountApplied,
          gift_card_code: giftCardCode || null,
          wallet_amount_applied: walletAmountApplied,
          saved_card_used: true,
        },
      });
    } else {
      // ── New card (Paystack redirect) ───────────────────────────────────
      const paystackData = await initializePaystackTransaction({
        email,
        amountInSmallestUnit: convertToSmallestUnit(amountToCollect),
        currency: v.currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          booking_id: booking.id,
          customer_id: v.customerId,
          amount_to_collect: amountToCollect,
          gift_card_amount_applied: giftCardAmountApplied,
          gift_card_code: giftCardCode || null,
          wallet_amount_applied: walletAmountApplied,
          currency: v.currency,
          tip_amount: v.tipAmount,
          tax_amount: v.taxAmount,
          travel_fee: v.travelFee,
          service_fee_amount: v.serviceFeeAmount,
          service_fee_percentage: v.serviceFeePercentage,
          commission_base: v.commissionBase,
          save_card: saveCard,
          set_as_default: setAsDefault,
          hold_id: validatedDraft.hold_id || undefined,
        },
      });

      paymentUrl = paystackData?.data?.authorization_url || null;

      await (supabase.from("bookings") as any)
        .update({
          payment_reference: reference,
          payment_provider: "paystack",
          payment_status: "pending",
        })
        .eq("id", booking.id);

      await (supabase.from("payments") as any).insert({
        booking_id: booking.id,
        user_id: v.customerId,
        provider_id: draft.provider_id,
        payment_number: "",
        amount: amountToCollect,
        currency: v.currency,
        status: "pending",
        payment_provider: "paystack",
        payment_provider_transaction_id: reference,
        payment_provider_response: paystackData,
        description: `Payment for booking ${booking.booking_number}`,
        metadata: {
          payment_option: v.provider.requires_deposit ? paymentOption : "full",
          gift_card_amount_applied: giftCardAmountApplied,
          gift_card_code: giftCardCode || null,
          wallet_amount_applied: walletAmountApplied,
          save_card: saveCard,
        },
      });
    }
  }

  return { paymentUrl };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Insert payment_transactions + finance_transactions when no external gateway
 * is involved (gift-card / wallet covers the full amount).
 */
async function insertNoGatewayLedger(
  supabase: SupabaseClient,
  ctx: {
    booking: any;
    draft: BookingDraft;
    v: ValidatedBookingData;
    giftCardAmountApplied: number;
    giftCardCode: string;
    walletAmountApplied: number;
  }
) {
  const { booking, draft, v, giftCardAmountApplied, giftCardCode: _giftCardCode, walletAmountApplied } = ctx;

  // Platform settings for commission
  const { data: settingsRow } = await (supabase.from("platform_settings") as any)
    .select("settings")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payoutSettings = (settingsRow as any)?.settings?.payouts || {};
  const commissionEnabled = payoutSettings.commission_enabled !== false;
  const commissionRate = commissionEnabled
    ? (payoutSettings.platform_commission_percentage ?? 0)
    : 0;

  const platformCommission =
    commissionEnabled && commissionRate > 0 ? (v.commissionBase * commissionRate) / 100 : 0;

  const providerEarnings = v.commissionBase - platformCommission + v.travelFee + v.tipAmount;

  const internalRef =
    walletAmountApplied > 0
      ? `wallet_booking_${booking.id}`
      : `giftcard_booking_${booking.id}`;

  await (supabase.from("payment_transactions") as any).insert({
    booking_id: booking.id,
    reference: internalRef,
    amount: v.totalAmount,
    fees: 0,
    net_amount: v.totalAmount,
    status: "success",
    provider: walletAmountApplied > 0 ? "wallet" : "gift_card",
    transaction_type: "charge",
    metadata: {
      kind: walletAmountApplied > 0 ? "wallet_booking" : "gift_card_booking",
      gift_card_amount_applied: giftCardAmountApplied,
      wallet_amount_applied: walletAmountApplied,
    },
    created_at: new Date().toISOString(),
  });

  await (supabase.from("finance_transactions") as any).insert([
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      transaction_type: "payment",
      amount: v.commissionBase,
      fees: 0,
      commission: platformCommission,
      net: platformCommission,
      description: `Payment for booking ${booking.booking_number} (gift card)`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings for booking ${booking.booking_number} (gift card)`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      transaction_type: "service_fee",
      amount: v.serviceFeeAmount,
      fees: 0,
      commission: 0,
      net: v.serviceFeeAmount,
      description: `Service fee for booking ${booking.booking_number}`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      transaction_type: "tip",
      amount: v.tipAmount,
      fees: 0,
      commission: 0,
      net: 0,
      description: `Tip for booking ${booking.booking_number}`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      transaction_type: "tax",
      amount: v.taxAmount,
      fees: 0,
      commission: 0,
      net: 0,
      description: `Tax for booking ${booking.booking_number}`,
      created_at: new Date().toISOString(),
    },
    ...(v.travelFee > 0
      ? [
          {
            booking_id: booking.id,
            provider_id: draft.provider_id,
            transaction_type: "travel_fee",
            amount: v.travelFee,
            fees: 0,
            commission: 0,
            net: 0,
            description: `Travel fee for booking ${booking.booking_number}`,
            created_at: new Date().toISOString(),
          },
        ]
      : []),
    ...(v.serviceFeeAmount > 0
      ? [
          {
            booking_id: booking.id,
            provider_id: draft.provider_id,
            transaction_type: "service_fee",
            amount: v.serviceFeeAmount,
            fees: 0,
            commission: 0,
            net: v.serviceFeeAmount,
            description: `Service fee for booking ${booking.booking_number}`,
            created_at: new Date().toISOString(),
          },
        ]
      : []),
  ]);
}
