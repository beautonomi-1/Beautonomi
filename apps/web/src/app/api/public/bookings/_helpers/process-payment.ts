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
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";
import { percentOf, subtractMoney } from "@beautonomi/utils";
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";
import { recordBookingPaystackPayment } from "@/lib/bookings/record-booking-paystack-payment";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { ensureWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { getPlatformPaymentTypesForTenant } from "@/lib/payments/platform-payment-types";
import { insertCustomerRecurringSeriesFromPaidBooking } from "@/lib/recurring/insert-customer-recurring-from-paid-booking";
import { subscribeRecurringEligible } from "@/lib/recurring/subscribe-recurring-eligibility";
import { recordLoyaltyRedemption } from "@/lib/loyalty/record-redemption";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PaymentResult {
  paymentUrl: string | null;
  paymentReference?: string | null;
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
  const providerRequiresDeposit = Boolean(v.provider.requires_deposit);
  const depositPct = Number(v.provider.deposit_percentage || 30);
  const computedDeposit = providerRequiresDeposit ? percentOf(v.totalAmount, depositPct) : 0;
  const isDepositPayment = providerRequiresDeposit && paymentOption !== "full";

  if (providerRequiresDeposit) {
    amountToCollect = isDepositPayment ? computedDeposit : v.totalAmount;
  }

  // Persist deposit context on the booking row so receipts, invoices, and
  // reports can display deposit vs balance information.
  if (providerRequiresDeposit) {
    await supabaseAdmin.from("bookings").update({
      deposit_required: true,
      deposit_percentage: depositPct,
      deposit_amount: computedDeposit,
      payment_option: isDepositPayment ? "deposit" : "full",
    }).eq("id", booking.id);
  }

  // ── Gift card reservation ────────────────────────────────────────────────
  const giftCardCode = (validatedDraft.gift_card_code || "").toString().trim().toUpperCase();
  let giftCardAmountApplied = 0;
  let giftCardId: string | null = null;

  if (paymentMethod === "giftcard" && !giftCardCode) {
    return handleApiError(
      new Error("Gift card code required"),
      "Enter a valid gift card code to pay with a gift card.",
      "VALIDATION_ERROR",
      400,
    );
  }

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
    await ensureWalletGiftBookingPayments(supabaseAdmin, {
      bookingId: booking.id,
      tenantId: booking.tenant_id,
      walletAmount: 0,
      giftCardAmount: giftCardAmountApplied,
    });
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

        await ensureWalletGiftBookingPayments(supabaseAdmin, {
          bookingId: booking.id,
          tenantId: booking.tenant_id,
          walletAmount: walletAmountApplied,
          giftCardAmount: 0,
        });

        amountToCollect = Math.max(0, amountToCollect - walletAmountApplied);
      }
    } catch (e: any) {
      return handleApiError(e, e?.message || "Wallet payment failed", "WALLET_ERROR", 400);
    }
  }

  // Gift-card payment method must settle the full collectible via gift. Never return
  // paymentUrl=null while a remainder exists — the client would navigate as if checkout succeeded.
  // `public/bookings` calls `releaseBookingSlotAfterPaymentFailure` when this returns an error,
  // which voids any reserved gift card and reverses wallet debits.
  if (paymentMethod === "giftcard" && amountToCollect > 0) {
    return handleApiError(
      new Error("Gift card does not cover the full booking amount"),
      "This gift card does not cover the full amount. Use card payment to combine a gift card with a card.",
      "INSUFFICIENT_GIFT_CARD_BALANCE",
      400,
    );
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
      // Ledger first: do not mark the booking as redeemed unless the points
      // deduction was recorded (or this is a true idempotent replay).
      const redemptionResult = await recordLoyaltyRedemption(supabaseAdmin, {
        customerId: v.customerId,
        points: loyaltyPointsRedeemed,
        description: `Redeemed for booking ${booking.booking_number}`,
        bookingId: booking.id,
      });
      if (!redemptionResult.recorded && redemptionResult.reason !== "already_redeemed") {
        console.error("Loyalty points deduction (no-gateway path):", redemptionResult.reason);
        return handleApiError(
          new Error("Loyalty points could not be redeemed"),
          "We could not redeem your loyalty points. Please try again.",
          "LOYALTY_REDEMPTION_FAILED",
          500,
        );
      }
      await (supabase.from("bookings") as any)
        .update({
          loyalty_points_used: loyaltyPointsRedeemed,
          loyalty_discount_amount: v.loyaltyDiscountAmount ?? 0,
        })
        .eq("id", booking.id);
    }

    const effectivePaymentStatus = isDepositPayment ? "partially_paid" : "paid";

    await (supabase.from("bookings") as any)
      .update({
        payment_status: effectivePaymentStatus,
        payment_provider: walletAmountApplied > 0 ? "wallet" : "gift_card",
        payment_date: new Date().toISOString(),
        status: shouldAutoConfirmStatus ? "confirmed" : "pending",
      })
      .eq("id", booking.id);

    await ensureWalletGiftBookingPayments(supabaseAdmin, {
      bookingId: booking.id,
      tenantId: booking.tenant_id,
      walletAmount: walletAmountApplied,
      giftCardAmount: giftCardAmountApplied,
    });

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

    return { paymentUrl: null, paymentReference: null };
  }

  // ── Card payment ─────────────────────────────────────────────────────────
  let paymentUrl: string | null = null;
  let paymentReference: string | null = null;

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
    paymentReference = reference;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const webSuccessUrl = `${baseUrl}/checkout/success?booking_id=${encodeURIComponent(booking.id)}&booking_number=${encodeURIComponent(booking.booking_number || "")}`;
    const clientCb = validatedDraft.paystack_callback_url?.trim();
    const callbackUrl =
      clientCb &&
      (clientCb.startsWith("customer://") || clientCb.startsWith("exp://") || clientCb.startsWith("https://"))
        ? clientCb
        : webSuccessUrl;

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
      let chargeResult: Awaited<ReturnType<typeof chargeAuthorization>>;
      try {
        chargeResult = await chargeAuthorization(
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
          { tenantId: flagTenantId, reference }
        );
      } catch (chargeErr) {
        // §Risk-hardening 2026-04: Paystack saved-card charge threw before we
        // got ANY response. Money has NOT moved. Return a clean 4xx/5xx so
        // the outer route releases the slot and the client shows a payment
        // error instead of a generic "failed to create booking" 500.
        console.error("[process-payment] chargeAuthorization threw:", chargeErr);
        return handleApiError(
          chargeErr,
          "Payment provider is temporarily unavailable. Please try again in a moment or use a different card.",
          "PAYMENT_INIT_FAILED",
          502,
        );
      }

      if (!chargeResult.status) {
        return handleApiError(
          new Error(chargeResult.message || "Payment failed"),
          "Failed to charge saved card",
          "PAYMENT_FAILED",
          400
        );
      }

      paymentUrl = null;

      // §Risk-hardening 2026-04: Paystack already captured money. Everything
      // below is reconciliation + ledger bookkeeping. A single DB hiccup here
      // must NOT be allowed to throw out of the route, because the outer
      // catch would return a 500 → the mobile/web client will retry the
      // whole booking flow → DOUBLE CHARGE. The Paystack webhook already
      // runs the same reconciliation via charge.success, so losing any of
      // these writes is recoverable; losing idempotency of the caller is
      // not. Wrap the whole tail in try/catch and log loudly.
      try {
        const chargeData = chargeResult.data as { id?: number; reference?: string; amount?: number };
        const amountMajor =
          typeof chargeData.amount === "number" ? chargeData.amount / 100 : amountToCollect;
        const recordedPayment = await recordBookingPaystackPayment(supabaseAdmin, {
          bookingId: booking.id,
          tenantId: booking.tenant_id ?? null,
          reference: chargeData.reference ?? reference,
          transactionId: chargeData.id ?? null,
          amountMajor,
          source: "process_payment_saved_card",
          paymentOption: v.provider.requires_deposit ? paymentOption : "full",
          requiresDeposit: Boolean(v.provider.requires_deposit),
          paymentMethodId: savedPaymentMethodId,
          notes: `Saved card charge. Ref: ${chargeData.reference ?? reference}`,
        });
        if (recordedPayment.ok === false) {
          console.error("[process-payment] failed to record saved-card booking_payments row after charge", {
            bookingId: booking.id,
            reference: chargeData.reference ?? reference,
            reason: recordedPayment.reason,
            error: recordedPayment.error,
          });
        }

        try {
          await syncBookingAfterPaystackSuccess(supabaseAdmin, booking.id, {
            paymentReference: chargeData?.reference,
            paymentProvider: "paystack",
          });
        } catch (syncErr) {
          console.error(
            "[process-payment] syncBookingAfterPaystackSuccess threw after successful saved-card charge; webhook will reconcile",
            { bookingId: booking.id, reference: chargeData?.reference, err: syncErr },
          );
        }

        if (recurringSubscribeEligible) {
          try {
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
          } catch (recurringErr) {
            console.error(
              "[process-payment] insertCustomerRecurringSeriesFromPaidBooking threw after saved-card charge",
              { bookingId: booking.id, err: recurringErr },
            );
          }
        }

        try {
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
        } catch (paymentRowErr) {
          console.error(
            "[process-payment] legacy payments insert threw after saved-card charge; webhook will reconcile",
            { bookingId: booking.id, err: paymentRowErr },
          );
        }
      } catch (reconcileErr) {
        // Catch-all: something outside the inner try/catches above still
        // threw (e.g. an await we added later forgot its wrapper). Do NOT
        // bubble; return success so the client doesn't retry.
        console.error(
          "[process-payment] post-charge reconcile threw; returning success to prevent double charge",
          { bookingId: booking.id, err: reconcileErr },
        );
      }
    } else {
      // ── New card (Paystack redirect) ───────────────────────────────────
      const loyaltyPointsRedeemed = v.loyaltyPointsRedeemed ?? 0;
      let paystackData: Awaited<ReturnType<typeof initializePaystackTransaction>>;
      try {
        paystackData = await initializePaystackTransaction({
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
      } catch (initErr) {
        // §Risk-hardening 2026-04: initialize failed before Paystack issued a
        // reference. No money moved, no payment row exists. Return a clean
        // 502 so the outer route releases the slot and the client can
        // retry without seeing a generic "failed to create booking" 500.
        console.error("[process-payment] initializePaystackTransaction threw:", initErr);
        return handleApiError(
          initErr,
          "Payment provider is temporarily unavailable. Please try again in a moment.",
          "PAYMENT_INIT_FAILED",
          502,
        );
      }

      paymentUrl = paystackData?.data?.authorization_url || null;

      await (supabase.from("bookings") as any)
        .update({
          payment_reference: reference,
          payment_provider: "paystack",
          payment_status: "pending",
          status: "pending_payment",
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
  // DESIGN DECISION: No booking_payments row is created here for customer cash bookings.
  // Cash means "pay at the salon" — money hasn't been collected yet.
  // When the provider later marks the booking as paid (via mark-paid endpoint),
  // a booking_payments row is created, which fires the DB trigger
  // (create_finance_ledger_from_payment) to generate finance_transactions entries.
  // This ensures cash revenue only appears in reports when actually collected.
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

  return { paymentUrl, paymentReference: paymentUrl ? paymentReference : null };
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

  const resolvedTenantId = booking.tenant_id ?? marketTenantId ?? null;
  const commissionRate = await resolveCommissionPercentageForProvider(supabase, {
    tenantId: resolvedTenantId,
    providerId: draft.provider_id,
  });

  // Scale commission to the amount actually collected (deposit vs full, wallet/gift card only).
  // Matches Paystack webhook: net_revenue_ratio × collected_amount (see charge-success.ts).
  const amountCollected = walletAmountApplied + giftCardAmountApplied;
  const effectiveAmount =
    amountCollected > 0 ? amountCollected : v.totalAmount;
  const bookingTotalForScale = v.totalAmount;
  const scale =
    bookingTotalForScale > 0 ? effectiveAmount / bookingTotalForScale : 1;
  const scaledCommissionBase = Math.max(
    0,
    Math.round(v.commissionBase * scale * 100) / 100,
  );

  const platformCommission =
    commissionRate > 0 ? percentOf(scaledCommissionBase, commissionRate) : 0;

  // provider_earnings represents the service-base share going to the provider, EXCLUDING tip and
  // travel fee — those are inserted as their own finance_transactions rows ("tip", "travel_fee")
  // to match the Paystack webhook path and avoid double-counting in aggregate reports.
  const providerEarnings = subtractMoney(scaledCommissionBase, platformCommission);

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
    amount: effectiveAmount,
    fees: 0,
    net_amount: effectiveAmount,
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

  // Idempotency: skip ledger writes if a payment row already exists for this booking
  // (prevents duplicates if this function is ever retried after a partial failure).
  const { data: existingLedgerPayment } = await (supabase.from("finance_transactions") as any)
    .select("id")
    .eq("booking_id", booking.id)
    .eq("transaction_type", "payment")
    .maybeSingle();

  if (existingLedgerPayment) {
    console.log(`[process-payment] finance_transactions already present for booking ${booking.id} (${settlementMethod}) — skipping duplicate write.`);
    return { paymentUrl: null };
  }

  const now = new Date().toISOString();
  await (supabase.from("finance_transactions") as any).insert([
    {
      booking_id: booking.id,
      provider_id: draft.provider_id,
      tenant_id: financeTenantId,
      transaction_type: "payment",
      amount: scaledCommissionBase,
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
            transaction_type: "platform_fee",
            amount: v.serviceFeeAmount,
            fees: 0,
            commission: 0,
            net: v.serviceFeeAmount,
            description: `Platform fee for booking ${booking.booking_number}`,
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
