import { SupabaseClient } from "@supabase/supabase-js";
import { handleApiError } from "@/lib/supabase/api-helpers";
import {
  isPaystackEnabledForTenant,
  isWalletEnabledForTenant,
  isGiftCardsEnabledForTenant,
} from "@/lib/subscriptions/entitlements";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { chargeAuthorization } from "@/lib/payments/paystack-complete";
import { getAppointmentSettingsFromDB } from "@/lib/provider-portal/appointment-settings";
import type { PublicBookingValidatedBody } from "@/lib/public-booking/booking-draft-schema";
import type { BookingDraft } from "@/types/beautonomi";
import type { ValidatedBookingData } from "./validate-booking";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { percentOf, subtractMoney, toCents } from "@beautonomi/utils";
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { getPlatformPaymentTypesForTenant } from "@/lib/payments/platform-payment-types";
import { insertCustomerRecurringSeriesFromPaidBooking } from "@/lib/recurring/insert-customer-recurring-from-paid-booking";
import { subscribeRecurringEligible } from "@/lib/recurring/subscribe-recurring-eligibility";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PaymentResult {
  paymentUrl: string | null;
}

/** Fields read from the booking row after `create_booking_with_locking` (and similar). */
export interface PublicBookingPaymentRow {
  id: string;
  booking_number?: string | null;
  tenant_id?: string | null;
}

export interface ProcessPaymentInput {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  draft: BookingDraft;
  validatedDraft: PublicBookingValidatedBody;
  v: ValidatedBookingData;
  booking: PublicBookingPaymentRow;
  /** Request Host → tenant; must align with `booking.tenant_id` for payment routing. */
  request: Request;
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
  const { supabase, supabaseAdmin, draft, validatedDraft, v, booking, request } = input;

  const tenantResolved = await resolvePaymentTenantForBookingRequest(
    request,
    booking.tenant_id,
  );
  if (tenantResolved.ok === false) {
    return tenantResolved.response;
  }
  const flagTenantId = tenantResolved.paymentTenantId;

  const paymentMethod = validatedDraft.payment_method || "card";
  const paymentOption = validatedDraft.payment_option || "deposit";
  const recurringSubscribeEligible = subscribeRecurringEligible({
    subscribe_recurring: validatedDraft.subscribe_recurring,
    reschedule_booking_id: validatedDraft.reschedule_booking_id,
    is_group_booking: validatedDraft.is_group_booking,
    has_group_participants: Boolean(
      validatedDraft.group_participants && validatedDraft.group_participants.length > 0,
    ),
  });
  const paymentTypes = await getPlatformPaymentTypesForTenant(
    supabaseAdmin as any,
    flagTenantId,
  );

  if (paymentMethod === "cash" && !paymentTypes.cash) {
    return handleApiError(
      new Error("Cash payments are currently unavailable"),
      "Cash payments are currently unavailable. Please pay online.",
      "FEATURE_DISABLED",
      400,
    );
  }

  // ── Determine amount to collect ──────────────────────────────────────────
  let amountToCollect = v.totalAmount;
  if (v.provider.requires_deposit) {
    const pct = Number(v.provider.deposit_percentage || 30);
    const deposit = percentOf(v.totalAmount, pct);
    amountToCollect = paymentOption === "full" ? v.totalAmount : deposit;
  }

  // ── Gift card reservation ────────────────────────────────────────────────
  const giftCardCode = (validatedDraft.gift_card_code || "").toString().trim().toUpperCase();
  let giftCardAmountApplied = 0;
  let giftCardId: string | null = null;

  if (giftCardCode && amountToCollect > 0) {
    const giftCardsEnabled = await isGiftCardsEnabledForTenant(flagTenantId);
    if (!giftCardsEnabled) {
      return handleApiError(
        new Error("Gift cards are currently unavailable"),
        "Gift cards are currently unavailable.",
        "FEATURE_DISABLED",
        400
      );
    }
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
    const walletEnabled = await isWalletEnabledForTenant(flagTenantId);
    if (!walletEnabled) {
      return handleApiError(
        new Error("Wallet payments are currently unavailable"),
        "Wallet payments are currently unavailable.",
        "FEATURE_DISABLED",
        400
      );
    }
    try {
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("balance, currency")
        .eq("user_id", v.customerId)
        .maybeSingle();

      const walletBalance = Number((wallet as any)?.balance || 0);
      if (walletBalance > 0) {
        walletAmountApplied = Math.min(walletBalance, amountToCollect);

        const walletLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: booking.tenant_id,
          provider_id: draft.provider_id,
        });

        await (supabase.rpc as any)("wallet_debit_self", {
          p_amount: walletAmountApplied,
          p_description: `Wallet spend for booking ${booking.booking_number}`,
          p_reference_id: booking.id,
          p_reference_type: "booking",
          p_tenant_id: walletLedgerTenantId,
        });

        await (supabase.from("bookings") as any)
          .update({ wallet_amount: walletAmountApplied })
          .eq("id", booking.id);

        amountToCollect = Math.max(0, amountToCollect - walletAmountApplied);

        // For split wallet+card payments, record the wallet portion in finance_transactions immediately.
        // The Paystack/card portion will be recorded by the webhook after payment succeeds.
        // This ensures the full collected amount is always visible in the ledger.
        if (amountToCollect > 0 && walletAmountApplied > 0) {
          try {
            const splitWalletTenantId = await resolveTenantIdForFinanceLedger(supabase, {
              tenant_id: booking.tenant_id ?? flagTenantId ?? null,
              provider_id: draft.provider_id,
            });
            await (supabase.from("finance_transactions") as any).insert({
              booking_id: booking.id,
              provider_id: draft.provider_id,
              tenant_id: splitWalletTenantId,
              transaction_type: "wallet_payment",
              amount: walletAmountApplied,
              fees: 0,
              commission: 0,
              net: walletAmountApplied,
              description: `Wallet contribution for booking ${booking.booking_number} (split payment — card covers remainder)`,
              created_at: new Date().toISOString(),
            });
          } catch (ledgerErr: any) {
            // Non-fatal: log and continue — the booking and wallet debit already succeeded
            console.error("[wallet-split-ledger] failed to insert wallet_payment entry:", ledgerErr?.message || ledgerErr);
          }
        }
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

    const loyaltyPointsRedeemed = v.loyaltyPointsRedeemed ?? 0;
    if (loyaltyPointsRedeemed > 0) {
      await (supabase.from("bookings") as any)
        .update({
          loyalty_points_used: loyaltyPointsRedeemed,
          loyalty_discount_amount: v.loyaltyDiscountAmount ?? 0,
        })
        .eq("id", booking.id);
      try {
        await (supabase.from("loyalty_point_transactions") as any).insert({
          user_id: v.customerId,
          points: loyaltyPointsRedeemed,
          transaction_type: "redeemed",
          description: `Redeemed for booking ${booking.booking_number}`,
          reference_id: booking.id,
          reference_type: "booking",
        });
      } catch (e: any) {
        console.error("Loyalty points deduction (no-gateway path):", e?.message || e);
      }
    }

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
      marketTenantId: flagTenantId,
    });

    if (recurringSubscribeEligible) {
      const recurringPay = paymentMethod === "cash" ? "cash" : "card";
      const sub = await insertCustomerRecurringSeriesFromPaidBooking({
        admin: supabaseAdmin,
        bookingId: booking.id,
        customerId: v.customerId,
        frequency: validatedDraft.subscribe_recurring!.frequency,
        paymentMethod: recurringPay,
      });
      if (sub.ok === false) {
        console.error("[recurring] insert after no-gateway payment:", sub.message);
      }
    }

    return { paymentUrl: null };
  }

  // ── Card payment ─────────────────────────────────────────────────────────
  let paymentUrl: string | null = null;

  if (paymentMethod === "card") {
    const paystackEnabled = await isPaystackEnabledForTenant(flagTenantId);
    if (!paystackEnabled) {
      return handleApiError(
        new Error("Online card payment is currently unavailable"),
        "Online card payment is currently unavailable. Please choose cash or another method.",
        "FEATURE_DISABLED",
        400
      );
    }

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackUrl = `${baseUrl}/checkout/success?booking_id=${encodeURIComponent(booking.id)}&booking_number=${encodeURIComponent(booking.booking_number || "")}`;

    const savedPaymentMethodId = validatedDraft.payment_method_id ?? null;
    const saveCard = validatedDraft.save_card === true;
    const setAsDefault = validatedDraft.set_as_default === true;

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

      const loyaltyPointsRedeemed = v.loyaltyPointsRedeemed ?? 0;
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
          loyalty_points_used: loyaltyPointsRedeemed > 0 ? loyaltyPointsRedeemed : undefined,
          loyalty_discount_amount: v.loyaltyDiscountAmount > 0 ? v.loyaltyDiscountAmount : undefined,
          ...(recurringSubscribeEligible
            ? { subscribe_recurring_frequency: validatedDraft.subscribe_recurring!.frequency }
            : {}),
        },
        { tenantId: flagTenantId }
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

      const chargeData = chargeResult.data as { id?: number; reference?: string; amount?: number };
      const paystackTxId =
        chargeData?.id !== undefined && chargeData?.id !== null
          ? String(chargeData.id)
          : null;
      if (paystackTxId) {
        const { data: existingBp } = await supabaseAdmin
          .from("booking_payments")
          .select("id")
          .eq("payment_provider", "paystack")
          .eq("payment_provider_id", paystackTxId)
          .maybeSingle();
        if (!existingBp) {
          const amountMajor =
            typeof chargeData.amount === "number" ? chargeData.amount / 100 : amountToCollect;
          const bookingTenantId = booking.tenant_id ?? null;
          await supabaseAdmin.from("booking_payments").insert({
            booking_id: booking.id,
            ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
            amount: amountMajor,
            payment_method: "card",
            payment_provider: "paystack",
            payment_provider_id: paystackTxId,
            status: "completed",
            notes: `Saved card charge. Ref: ${chargeData.reference ?? ""}`,
            payment_provider_data: {
              source: "process_payment_saved_card",
              reference: chargeData.reference,
            },
          });
        }
      }

      await syncBookingAfterPaystackSuccess(supabaseAdmin, booking.id, {
        paymentReference: chargeData?.reference,
        paymentProvider: "paystack",
      });

      if (recurringSubscribeEligible) {
        const sub = await insertCustomerRecurringSeriesFromPaidBooking({
          admin: supabaseAdmin,
          bookingId: booking.id,
          customerId: v.customerId,
          frequency: validatedDraft.subscribe_recurring!.frequency,
          paymentMethod: "card",
        });
        if (sub.ok === false) {
          console.error("[recurring] insert after saved card charge:", sub.message);
        }
      }

      await (supabase.from("payments") as any).insert({
        booking_id: booking.id,
        user_id: v.customerId,
        provider_id: draft.provider_id,
        payment_number: "",
        amount: amountToCollect,
        currency: v.currency,
        status: "completed",
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
      const loyaltyPointsRedeemed = v.loyaltyPointsRedeemed ?? 0;
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
          booking_total_amount: v.totalAmount,
          payment_option: v.provider.requires_deposit ? paymentOption : "full",
          requires_deposit: Boolean(v.provider.requires_deposit),
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
          loyalty_points_used: loyaltyPointsRedeemed > 0 ? loyaltyPointsRedeemed : undefined,
          loyalty_discount_amount: v.loyaltyDiscountAmount > 0 ? v.loyaltyDiscountAmount : undefined,
          ...(recurringSubscribeEligible
            ? { subscribe_recurring_frequency: validatedDraft.subscribe_recurring!.frequency }
            : {}),
        },
        tenantId: flagTenantId,
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

  // ── Cash payment — explicitly mark as pending (pay at appointment) ──────────
  if (paymentMethod === "cash") {
    const appointmentSettings = await getAppointmentSettingsFromDB(
      supabaseAdmin,
      draft.provider_id
    );
    const cashStatus = appointmentSettings.requireConfirmationForBookings ? "pending" : "confirmed";
    await (supabase.from("bookings") as any)
      .update({
        payment_provider: "cash",
        payment_status: "pending",
        payment_method: "cash",
        status: cashStatus,
      })
      .eq("id", booking.id);

    if (recurringSubscribeEligible) {
      const sub = await insertCustomerRecurringSeriesFromPaidBooking({
        admin: supabaseAdmin,
        bookingId: booking.id,
        customerId: v.customerId,
        frequency: validatedDraft.subscribe_recurring!.frequency,
        paymentMethod: "cash",
      });
      if (sub.ok === false) {
        console.error("[recurring] insert after cash booking:", sub.message);
      }
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
    booking: PublicBookingPaymentRow;
    draft: BookingDraft;
    v: ValidatedBookingData;
    giftCardAmountApplied: number;
    giftCardCode: string;
    walletAmountApplied: number;
    marketTenantId?: string | null;
  }
) {
  const { booking, draft, v, giftCardAmountApplied, giftCardCode: _giftCardCode, walletAmountApplied, marketTenantId } = ctx;

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: booking.tenant_id ?? marketTenantId ?? null,
    provider_id: draft.provider_id,
  });

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
    commissionEnabled && commissionRate > 0 ? percentOf(v.commissionBase, commissionRate) : 0;

  const providerEarnings = subtractMoney(v.commissionBase, platformCommission) + v.travelFee + v.tipAmount;

  // Determine the settlement method label for ledger descriptions and provider field.
  // Priority: wallet > gift_card > package/entitlement (zero-cost)
  const settlementMethod =
    walletAmountApplied > 0 && giftCardAmountApplied > 0
      ? "wallet_and_gift_card"
      : walletAmountApplied > 0
        ? "wallet"
        : giftCardAmountApplied > 0
          ? "gift_card"
          : "package_entitlement";
  const settlementLabel =
    settlementMethod === "wallet_and_gift_card"
      ? "wallet + gift card"
      : settlementMethod === "wallet"
        ? "wallet"
        : settlementMethod === "gift_card"
          ? "gift card"
          : "package/entitlement";

  const internalRef = `${settlementMethod}_booking_${booking.id}`;

  await (supabase.from("payment_transactions") as any).insert({
    booking_id: booking.id,
    reference: internalRef,
    amount: v.totalAmount,
    fees: 0,
    net_amount: v.totalAmount,
    status: "success",
    provider: settlementMethod === "wallet_and_gift_card" ? "wallet" : settlementMethod,
    transaction_type: "charge",
    metadata: {
      kind: `${settlementMethod}_booking`,
      gift_card_amount_applied: giftCardAmountApplied,
      wallet_amount_applied: walletAmountApplied,
      settlement_method: settlementMethod,
    },
    created_at: new Date().toISOString(),
  });

  const now = new Date().toISOString();
  await (supabase.from("finance_transactions") as any).insert([
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      tenant_id: financeTenantId,
      transaction_type: "payment",
      amount: v.commissionBase,
      fees: 0,
      commission: platformCommission,
      net: platformCommission,
      description: `Payment for booking ${booking.booking_number} (${settlementLabel})`,
      created_at: now,
    },
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      tenant_id: financeTenantId,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings for booking ${booking.booking_number} (${settlementLabel})`,
      created_at: now,
    },
    ...(v.tipAmount > 0
      ? [{
          booking_id: booking.id,
          provider_id: draft.provider_id,
          tenant_id: financeTenantId,
          transaction_type: "tip",
          amount: v.tipAmount,
          fees: 0,
          commission: 0,
          net: v.tipAmount,
          description: `Tip for booking ${booking.booking_number}`,
          created_at: now,
        }]
      : []),
    ...(v.taxAmount > 0
      ? [{
          booking_id: booking.id,
          provider_id: draft.provider_id,
          tenant_id: financeTenantId,
          transaction_type: "tax",
          amount: v.taxAmount,
          fees: 0,
          commission: 0,
          net: 0,
          description: `Tax for booking ${booking.booking_number}`,
          created_at: now,
        }]
      : []),
    ...(v.travelFee > 0
      ? [
          {
            booking_id: booking.id,
            provider_id: draft.provider_id,
            tenant_id: financeTenantId,
            transaction_type: "travel_fee",
            amount: v.travelFee,
            fees: 0,
            commission: 0,
            net: v.travelFee,
            description: `Travel fee for booking ${booking.booking_number}`,
            created_at: now,
          },
        ]
      : []),
    ...(v.serviceFeeAmount > 0
      ? [
          {
            booking_id: booking.id,
            provider_id: draft.provider_id,
            tenant_id: financeTenantId,
            transaction_type: "service_fee",
            amount: v.serviceFeeAmount,
            fees: 0,
            commission: 0,
            net: v.serviceFeeAmount,
            description: `Service fee for booking ${booking.booking_number}`,
            created_at: now,
          },
        ]
      : []),
    // Record wallet and gift-card payment sources as separate ledger entries for full audit trail
    ...(walletAmountApplied > 0
      ? [{
          booking_id: booking.id,
          provider_id: draft.provider_id,
          tenant_id: financeTenantId,
          transaction_type: "wallet_payment",
          amount: walletAmountApplied,
          fees: 0,
          commission: 0,
          net: walletAmountApplied,
          description: `Wallet payment for booking ${booking.booking_number}`,
          created_at: now,
        }]
      : []),
    ...(giftCardAmountApplied > 0
      ? [{
          booking_id: booking.id,
          provider_id: draft.provider_id,
          tenant_id: financeTenantId,
          transaction_type: "gift_card_payment",
          amount: giftCardAmountApplied,
          fees: 0,
          commission: 0,
          net: giftCardAmountApplied,
          description: `Gift card payment for booking ${booking.booking_number}`,
          created_at: now,
        }]
      : []),
    // Gift card liability reduction: when a gift card is redeemed the gift_card_sale entry
    // (recorded at purchase time) represents a deferred liability. The redemption unwinds it.
    ...(giftCardAmountApplied > 0
      ? [{
          booking_id: booking.id,
          provider_id: draft.provider_id,
          tenant_id: financeTenantId,
          transaction_type: "gift_card_liability_reduction",
          amount: giftCardAmountApplied,
          fees: 0,
          commission: 0,
          net: -giftCardAmountApplied,
          description: `Gift card liability redeemed for booking ${booking.booking_number}`,
          created_at: now,
        }]
      : []),
    // Promotion discount: record as a negative revenue line so GMV vs net revenue is clear.
    ...(v.promoDiscountAmount > 0
      ? [{
          booking_id: booking.id,
          provider_id: draft.provider_id,
          tenant_id: financeTenantId,
          transaction_type: "promotion_discount",
          amount: v.promoDiscountAmount,
          fees: 0,
          commission: 0,
          net: -v.promoDiscountAmount,
          description: `Promotion discount applied to booking ${booking.booking_number}`,
          created_at: now,
        }]
      : []),
  ]);
}
