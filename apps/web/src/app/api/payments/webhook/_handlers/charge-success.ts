/**
 * Charge Event Handlers
 *
 * Handles charge.success and charge.failed Paystack webhook events including:
 *   - Standard booking payments
 *   - Custom offer payments
 *   - Wallet top-ups
 *   - Gift card orders
 *   - Membership orders
 *   - Provider subscription orders (one-time & authorization)
 *   - Additional charges on existing bookings
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_PAYMENT_SUCCESS, EVENT_PAYMENT_FAILED } from "@/lib/analytics/amplitude/types";
import type { PaystackEvent, SupabaseClient } from "./shared";
import { savePaystackAuthorization, generateGiftCardCode } from "./shared";
import { recordLoyaltyRedemption } from "@/lib/loyalty/record-redemption";
import { recordPromotionUsage } from "@/lib/promotions/record-promotion-usage";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { percentOf, subtractMoney } from "@beautonomi/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import {
  creditWalletForProductOrderIfNeeded,
  restockProductOrderLineItems,
} from "@/lib/orders/product-order-lifecycle";
import { tryCreateCustomerRecurringFromPaystackChargeMetadata } from "@/lib/recurring/try-create-recurring-from-paystack-metadata";
import { applyWalletTopupFromSuccessfulPaystackCharge } from "@/lib/wallet/apply-wallet-topup-from-paystack-success";
import { recordBookingPaystackPayment } from "@/lib/bookings/record-booking-paystack-payment";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import {
  completeWalletGiftSyntheticPayments,
  ensureWalletGiftBookingPayments,
} from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";
import { finalizeCustomOfferPaymentFromPaystackEvent } from "@/lib/custom-offers/finalize-custom-offer-payment";
import {
  isPaystackTerminalCharge,
  recordPaystackTerminalCharge,
  resolveKnownTerminalForCharge,
} from "@/lib/payments/paystack-terminal-webhook";

async function lastResortCurrencyFromTenantId(
  tenantId: string | null | undefined,
  options?: { supabase?: SupabaseClient; providerId?: string | null | undefined },
): Promise<string> {
  if (tenantId) {
    const tr = await getTenantRegionConfig(tenantId);
    return tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  }
  const pid = options?.providerId;
  if (options?.supabase && pid) {
    const { data } = await options.supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", pid)
      .maybeSingle();
    const tid = (data as { tenant_id?: string | null } | null)?.tenant_id;
    if (tid) {
      const tr = await getTenantRegionConfig(tid);
      return tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    }
  }
  return LAST_RESORT_CURRENCY;
}

/** Paystack charge webhook payload (reference, metadata, amount, etc.) */
type PaystackChargeData = {
  reference?: string;
  metadata?: Record<string, unknown> & { booking_id?: string; customer_id?: string; [k: string]: unknown };
  amount?: number;
  fees?: number;
  customer?: { email?: string; customer_code?: string };
  authorization?: { authorization_code?: string; reusable?: boolean; last4?: string; exp_month?: string; exp_year?: string; brand?: string; card_type?: string };
  message?: string;
  gateway_response?: string;
  /** Present on some subscription renewal charges (Paystack object shape varies by event). */
  subscription?: { subscription_code?: string };
  plan?: { subscription?: { subscription_code?: string } };
};

/**
 * Resolve Paystack subscription code from a charge.failed / charge payload.
 * Renewals may omit booking metadata; subscription linkage can appear on metadata or nested objects.
 */
function extractPaystackSubscriptionCodeFromCharge(data: PaystackChargeData): string | null {
  const meta = data.metadata || {};
  const fromMeta = meta.subscription_code ?? meta.paystack_subscription_code;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  const direct = data.subscription?.subscription_code;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const fromPlan = data.plan?.subscription?.subscription_code;
  if (typeof fromPlan === "string" && fromPlan.trim()) return fromPlan.trim();
  return null;
}

/** Booking row fields used in charge handlers */
type ChargeBookingRow = Record<string, unknown> & {
  payment_status?: string;
  payment_reference?: string;
  provider_id?: string;
  customer_id?: string;
  booking_number?: string;
  total_amount?: number;
  tip_amount?: number;
  tax_amount?: number;
  travel_fee?: number;
  service_fee_amount?: number;
  platform_service_fee?: number;
  loyalty_points_used?: number;
  currency?: string;
  promotion_id?: string;
  promotion_discount_amount?: number;
  tenant_id?: string | null;
};

// ─── Exported Handlers ───────────────────────────────────────────────────────

/**
 * Handle charge.success events — booking fulfilment, card saving, ledger entries
 */
export async function handleChargeSuccess(
  event: PaystackEvent,
  supabase: SupabaseClient,
): Promise<NextResponse> {
  await processSuccessfulPayment(event.data, supabase);
  return NextResponse.json({ received: true });
}

/**
 * Handle charge.failed events — mark bookings failed, void gift-card holds, etc.
 */
export async function handleChargeFailed(
  event: PaystackEvent,
  supabase: SupabaseClient,
): Promise<NextResponse> {
  await processFailedPayment(event.data, supabase);
  return NextResponse.json({ received: true });
}

// ─── charge.success internals ────────────────────────────────────────────────

export async function processSuccessfulPayment(data: PaystackChargeData, supabase: SupabaseClient) {
  const reference = data.reference;
  const metaObj: Record<string, unknown> =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {};
  const hasNonAdsRoutingMetadata = Boolean(
    metaObj.product_order_id ||
      metaObj.wallet_topup_id ||
      metaObj.gift_card_order_id ||
      metaObj.membership_order_id ||
      metaObj.provider_subscription_order_id ||
      metaObj.custom_offer_id ||
      metaObj.booking_id ||
      metaObj.bookingId ||
      metaObj.kind === "card_verification",
  );
  if (reference && !metaObj.ads_budget_order_id && !hasNonAdsRoutingMetadata) {
    const { data: adsByRef } = await supabase
      .from("ads_budget_orders")
      .select("id, campaign_id, provider_id")
      .eq("paystack_reference", String(reference))
      .maybeSingle();
    if (adsByRef) {
      const ar = adsByRef as { id?: unknown; campaign_id?: string | null; provider_id?: string | null };
      const orderIdStr = ar.id != null && ar.id !== "" ? String(ar.id) : "";
      if (orderIdStr) {
        metaObj.ads_budget_order_id = orderIdStr;
        if (ar.campaign_id) metaObj.campaign_id = ar.campaign_id;
        if (ar.provider_id) metaObj.provider_id = ar.provider_id;
      }
    }
  }
  if (reference && !metaObj.provider_subscription_order_id) {
    const { data: subOrderByRef } = await supabase
      .from("provider_subscription_orders")
      .select("id")
      .eq("paystack_reference", String(reference))
      .maybeSingle();
    if (subOrderByRef) {
      const sid = (subOrderByRef as { id?: unknown }).id;
      const idStr = sid != null && sid !== "" ? String(sid) : "";
      if (idStr) {
        metaObj.provider_subscription_order_id = idStr;
      }
    }
  }
  data.metadata = metaObj as PaystackChargeData["metadata"];
  if (isPaystackTerminalCharge(data as any)) {
    await recordPaystackTerminalCharge(supabase, data as any);
    return;
  }
  const { metadata, amount, fees, customer, authorization } = data;

  if (!reference || !metadata?.booking_id) {
    if (metadata?.product_order_id && reference) {
      const productOrderId = String(metadata.product_order_id);
      const payRecord = await recordProductOrderPayment({
        supabase,
        productOrderId,
        reference: String(reference),
        amountMajor: convertFromSmallestUnit(amount || 0),
        feesMajor: convertFromSmallestUnit(fees || 0),
        source: "paystack_webhook",
        provider: "paystack",
      });
      const { notifyProductOrderPaidIfTransitioned } = await import(
        "@/lib/notifications/notify-product-order-paid"
      );
      await notifyProductOrderPaidIfTransitioned(supabase, productOrderId, {
        transitionedToPaid: payRecord.transitionedToPaid,
      });
      return;
    }
    // Non-booking flows (gift cards, subscriptions, etc.)
    if (metadata?.custom_offer_id) {
      await handleCustomOfferSuccess(
        { reference, metadata, amount, fees, customer, authorization },
        supabase,
      );
      return;
    }
    if (metadata?.wallet_topup_id) {
      await applyWalletTopupFromSuccessfulPaystackCharge({ reference, metadata, amount }, supabase);
      return;
    }
    if (metadata?.gift_card_order_id) {
      await handleGiftCardOrderSuccess({ reference, metadata, amount }, supabase);
      return;
    }
    if (metadata?.membership_order_id) {
      await handleMembershipOrderSuccess({ reference, metadata, amount, fees }, supabase);
      return;
    }
    if (metadata?.provider_subscription_order_id) {
      if (metadata?.kind === "subscription_authorization") {
        await handleSubscriptionAuthorizationSuccess(
          { reference, metadata, amount, fees, customer, authorization: data.authorization },
          supabase,
        );
      } else {
        await handleProviderSubscriptionOrderSuccess(
          { reference, metadata, amount, fees, customer },
          supabase,
        );
      }
      return;
    }
    if (metadata?.ads_budget_order_id) {
      await handleAdsBudgetOrderSuccess({ reference, metadata, amount, fees }, supabase);
      return;
    }
    if (metadata?.kind === "card_verification" && reference) {
      await handleCustomerCardVerificationSuccess(
        {
          reference,
          metadata,
          amount: amount || 0,
          fees: fees || 0,
          customer,
          authorization,
        },
        supabase,
      );
      return;
    }
    // Last resort: a hosted Paystack Virtual Terminal payment can arrive without any of
    // our routing metadata. Before giving up, try to map it to a known terminal (incl. a
    // Paystack verify re-read) so in-person terminal payments still land in the inbox.
    if (reference) {
      const terminalContext = await resolveKnownTerminalForCharge(supabase, data as any);
      if (terminalContext) {
        await recordPaystackTerminalCharge(supabase, data as any, { context: terminalContext });
        return;
      }
    }
    console.error("Missing reference or booking_id in payment data");
    return;
  }

  // Additional charge payment flow (metadata may use additional_charge_id or legacy charge_id)
  if (metadata?.additional_charge_id || metadata?.charge_id) {
    const merged = {
      ...metadata,
      additional_charge_id: metadata.additional_charge_id || metadata.charge_id,
    };
    await handleAdditionalChargeSuccess({ reference, metadata: merged, amount, fees, customer }, supabase);
    return;
  }

  // Pay remaining balance (deposit-only bookings)
  if (metadata?.payment_type === "booking_remaining") {
    await handleBookingRemainingSuccess({ reference, metadata, amount, fees, customer }, supabase);
    return;
  }

  // ── Standard booking payment ──────────────────────────────────────────────

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", metadata.booking_id)
    .single();

  if (bookingError || !booking) {
    // B2: previously logged + returned, which caused the webhook router to
    // return 200 to Paystack and never retry. Throw so the outer handler
    // records the event as failed and Paystack can retry. This covers the
    // race where the booking row was deleted between checkout initiation and
    // webhook delivery, OR metadata carrying a stale booking_id.
    const err = new Error(
      `charge.success: booking ${metadata.booking_id} not found (reference=${reference})`
    );
    (err as Error & { cause?: unknown }).cause = bookingError ?? null;
    throw err;
  }

  const bookingData = booking as ChargeBookingRow;

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: bookingData.tenant_id as string | null | undefined,
    provider_id: bookingData.provider_id as string | null | undefined,
  });

  const { data: alreadySettledPaymentTx } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("provider", "paystack")
    .eq("reference", reference)
    .maybeSingle();

  if (alreadySettledPaymentTx) {
    console.log(`[charge-success] Paystack ref ${reference} already settled — skipping (idempotent retry).`);
    const amountInCurrency = convertFromSmallestUnit(amount || 0);
    if (amountInCurrency > 0) {
      const recordedPayment = await recordBookingPaystackPayment(supabase, {
        bookingId: metadata.booking_id,
        tenantId: bookingData.tenant_id ?? financeTenantId ?? null,
        reference,
        transactionId: null,
        amountMajor: amountInCurrency,
        source: "paystack_webhook_idempotent_repair",
        paymentOption: typeof metadata?.payment_option === "string" ? metadata.payment_option : null,
        requiresDeposit: Boolean(metadata?.requires_deposit),
        saveCard: Boolean(metadata?.save_card),
        notes: `Payment received via Paystack webhook retry. Ref: ${reference}`,
      });
      if (recordedPayment.ok === false) {
        console.error("[charge-success] idempotent booking_payments repair failed:", recordedPayment);
      }
    }
    await syncBookingAfterPaystackSuccess(supabase, metadata.booking_id, {
      paymentReference: reference,
      paymentProvider: "paystack",
    });
    try {
      await tryCreateCustomerRecurringFromPaystackChargeMetadata(
        supabase,
        metadata as Record<string, unknown> | undefined,
      );
    } catch (recurringErr) {
      console.error("[recurring] charge.success idempotent recurring hook:", recurringErr);
    }
    return;
  }

  // Calculate amounts (Paystack amounts are in smallest currency unit)
  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  // Tip/tax/travel and customer-paid platform fees are excluded from commission.
  // These are the FULL booking-level amounts (used for booking-level ledger entries).
  const tipAmount = Number(metadata?.tip_amount ?? bookingData.tip_amount ?? 0);
  const taxAmount = Number(metadata?.tax_amount ?? bookingData.tax_amount ?? 0);
  const travelFee = Number(metadata?.travel_fee ?? bookingData.travel_fee ?? 0);
  // Prefer Paystack metadata (always populated by process-payment.ts). Fall back
  // to DB columns using || so a legacy 0-default platform_fee_amount never masks a
  // non-zero service_fee_amount (mirrors the || fix in /api/me/bookings/[id]).
  const serviceFeeAmount = Number(
    metadata?.service_fee_amount ??
      ((bookingData as Record<string, unknown>).platform_fee_amount ||
        bookingData.service_fee_amount ||
        bookingData.platform_service_fee ||
        0),
  );

  // Split wallet / gift card + card: commission base must reflect all funds applied
  // to this booking in this transaction (Paystack amount + wallet + gift card),
  // not the card portion alone — otherwise provider_earnings is understated.
  const walletAmountFromMeta = Number(metadata?.wallet_amount_applied ?? 0);
  const giftCardAmountFromMeta = Number(metadata?.gift_card_amount_applied ?? 0);
  const totalCollectedForCommission =
    amountInCurrency + walletAmountFromMeta + giftCardAmountFromMeta;

  // Commission base must be proportional to the ACTUAL collected amount, not the
  // full booking total. For deposit payments, metadata.commission_base contains the
  // full booking's commission base, which would overstate revenue. Instead, compute
  // the net-revenue ratio from booking totals and apply it to the collected amount.
  const bookingTotal = Number(bookingData.total_amount || 0);
  const fullCommissionBase = bookingTotal > 0
    ? bookingTotal - tipAmount - taxAmount - travelFee - serviceFeeAmount
    : 0;
  const netRevenueRatio = bookingTotal > 0
    ? Math.max(0, fullCommissionBase / bookingTotal)
    : 1;
  const commissionBase = Math.max(
    0,
    Math.round(totalCollectedForCommission * netRevenueRatio * 100) / 100,
  );

  const resolvedTenantIdForPlatformSettings =
    bookingData.tenant_id ?? financeTenantId ?? null;
  const commissionRate = await resolveCommissionPercentageForProvider(supabase, {
    tenantId: resolvedTenantIdForPlatformSettings,
    providerId: bookingData.provider_id ?? null,
  });

  const platformCommission =
    commissionRate > 0 ? percentOf(commissionBase, commissionRate) : 0;

  // Provider earnings for this charge: commission base minus platform take.
  // Travel and tip are booking-level items recorded separately (not per-charge).
  const providerEarnings = subtractMoney(commissionBase, platformCommission);

  // Deposit-aware payment status: if this is a deposit-only charge, the booking
  // is partially_paid (balance still owed), not fully paid.
  const stdPaymentOption = String(metadata?.payment_option || "full");
  const stdRequiresDeposit = Boolean(metadata?.requires_deposit);
  const stdIsDeposit = stdRequiresDeposit && stdPaymentOption === "deposit";

  // Ensure booking_payments parity for webhook-first flows.
  // This keeps bookings.total_paid / payment_status aligned even if redirect verify is skipped.
  // Idempotency is enforced by migration 380 unique index on (payment_provider, payment_provider_id).
  if (amountInCurrency > 0) {
    const recordedPayment = await recordBookingPaystackPayment(supabase, {
      bookingId: metadata.booking_id,
      tenantId: financeTenantId,
      reference,
      transactionId: null,
      amountMajor: amountInCurrency,
      source: "paystack_webhook",
      paymentOption: stdPaymentOption,
      requiresDeposit: stdRequiresDeposit,
      saveCard: Boolean(metadata?.save_card),
      notes: stdIsDeposit
        ? `Deposit payment received via Paystack webhook. Ref: ${reference}`
        : `Payment received via Paystack webhook. Ref: ${reference}`,
    });
    if (recordedPayment.ok === false) {
      console.error("[charge-success] booking_payments insert failed:", recordedPayment);
    }
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      payment_reference: reference,
      payment_date: new Date().toISOString(),
      payment_provider: "paystack",
    })
    .eq("id", metadata.booking_id);

  if (updateError) {
    console.error("Error updating booking payment status:", updateError);
    throw updateError;
  }

  // Gift cards: capture reserved redemption
  let giftCardCaptured = giftCardAmountFromMeta <= 0;
  try {
    if (giftCardAmountFromMeta > 0) {
      const { data: captureResult } = await supabase.rpc("capture_gift_card_redemption", {
        p_booking_id: metadata.booking_id,
      });

      if (captureResult === false || captureResult === null) {
        console.warn(
          `Gift card redemption capture failed for booking ${metadata.booking_id}. Check if gift card expired.`,
        );
        await supabase
          .from("bookings")
          .update({
            gift_card_id: null,
            gift_card_amount: 0,
          })
          .eq("id", metadata.booking_id);
      } else {
        giftCardCaptured = true;
      }
    }
  } catch (gcError: unknown) {
    const errorMessage = gcError instanceof Error ? gcError.message : String(gcError);

    if (errorMessage.includes("expired") || errorMessage.includes("no longer active")) {
      console.warn(
        `Gift card expired for booking ${metadata.booking_id}. Redemption voided:`,
        errorMessage,
      );

      await supabase
        .from("bookings")
        .update({
          gift_card_id: null,
          gift_card_amount: 0,
        })
        .eq("id", metadata.booking_id);
    } else {
      console.error("Error capturing gift card redemption:", gcError);
    }
  }

  await syncBookingAfterPaystackSuccess(supabase, metadata.booking_id, {
    paymentReference: reference,
    paymentProvider: "paystack",
  });

  // Loyalty points: deduct if used (idempotent; same as verify so only one path applies)
  // §Customer-audit 2026-04: centralised through recordLoyaltyRedemption so both
  // the canonical `loyalty_points_ledger` and the legacy
  // `loyalty_point_transactions` table are kept in sync. Previously only the
  // legacy table was written to, so the ledger balance never reflected the
  // deduction and the customer could redeem the same points again.
  const loyaltyPointsUsed = Number(
    metadata?.loyalty_points_used ?? bookingData?.loyalty_points_used ?? 0
  );
  if (loyaltyPointsUsed > 0 && (metadata?.customer_id || bookingData?.customer_id)) {
    const customerId = (metadata?.customer_id || bookingData?.customer_id) as string;
    try {
      const result = await recordLoyaltyRedemption(supabase, {
        customerId,
        points: loyaltyPointsUsed,
        description: `Redeemed for booking ${bookingData?.booking_number ?? metadata.booking_id}`,
        bookingId: metadata.booking_id,
      });
      if (result.recorded) {
        const loyaltyDiscountAmount = Number(
          metadata?.loyalty_discount_amount ??
            (bookingData as { loyalty_discount_amount?: number }).loyalty_discount_amount ??
            0,
        );
        await supabase
          .from("bookings")
          .update({
            loyalty_points_used: loyaltyPointsUsed,
            loyalty_discount_amount: loyaltyDiscountAmount,
          })
          .eq("id", metadata.booking_id);
      } else if (result.reason !== "already_redeemed") {
        await supabase
          .from("bookings")
          .update({
            loyalty_points_used: 0,
            loyalty_discount_amount: 0,
          })
          .eq("id", metadata.booking_id);
        console.error("Loyalty points deduction failed:", result.reason || "not_recorded");
      }
    } catch (loyaltyErr: unknown) {
      const msg = loyaltyErr instanceof Error ? loyaltyErr.message : String(loyaltyErr);
      console.error("Loyalty points deduction failed:", msg);
      await supabase
        .from("bookings")
        .update({
          loyalty_points_used: 0,
          loyalty_discount_amount: 0,
        })
        .eq("id", metadata.booking_id);
    }
  }

  // Save card if requested and authorization is reusable
  if (
    metadata?.save_card &&
    authorization?.authorization_code &&
    authorization?.reusable &&
    customer?.email &&
    metadata?.customer_id
  ) {
    try {
      await savePaystackAuthorization({
        userId: metadata.customer_id,
        email: customer.email,
        authorizationCode: authorization.authorization_code,
        lastFour: authorization.last4,
        expiryMonth: parseInt(authorization.exp_month || "0"),
        expiryYear: parseInt(authorization.exp_year || "0"),
        cardBrand: authorization.brand || authorization.card_type || "unknown",
        isDefault: metadata.set_as_default === true,
        supabase,
      });
    } catch (saveError) {
      console.error("Error saving payment method:", saveError);
    }
  }

  const webhookNow = new Date().toISOString();

  // ── Idempotency guard — MUST run before payment_transactions insert ───────
  // Two scenarios:
  //
  //   A. Same Paystack reference fires twice (webhook retry).
  //      Detected by: payment_transactions already has a row for this reference.
  //      Action: return immediately — skip everything.
  //
  //   B. A SECOND Paystack charge on the same booking (deposit + pay-remaining
  //      both routed through this handler instead of the pay-remaining handler).
  //      Detected by: finance_transactions already has a 'payment' row for this
  //      booking but the Paystack reference is new.
  //      Action: write payment + provider_earnings ONLY (per-charge amounts).
  //      Booking-level rows (platform_fee, tax, tip, travel_fee) are recorded once
  //      from the first charge and must NOT be written again.
  const { data: existingPaymentTxForRef } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("provider", "paystack")
    .eq("reference", reference)
    .maybeSingle();

  if (existingPaymentTxForRef) {
    // Scenario A: webhook retry for a reference already fully processed.
    console.log(`[charge-success] Paystack ref ${reference} already in payment_transactions — skipping (idempotent retry).`);
    await completeWalletGiftSyntheticPayments(supabase, metadata.booking_id);
    return;
  }

  // Scenario B detection: has the ledger for this booking been written before?
  // Use 'payment' row as the indicator — it is always written for any non-zero charge.
  const { data: existingFinancePaymentRow } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", metadata.booking_id)
    .eq("transaction_type", "payment")
    .maybeSingle();
  const isSecondCharge = !!existingFinancePaymentRow;

  // Now insert the payment_transactions row for this charge (after idempotency checks).
  const { error: paymentTxInsertError } = await supabase.from("payment_transactions").insert({
    booking_id: metadata.booking_id,
    reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    metadata: {
      paystack_reference: reference,
      customer_email: customer?.email,
      customer_code: customer?.customer_code,
    },
    created_at: webhookNow,
  });
  if (paymentTxInsertError) {
    if (paymentTxInsertError.code === "23505") {
      console.log(`[charge-success] Paystack ref ${reference} was settled concurrently — skipping duplicate ledger writes.`);
      await completeWalletGiftSyntheticPayments(supabase, metadata.booking_id);
      return;
    }
    throw paymentTxInsertError;
  }

  const splitWalletOrGift =
    walletAmountFromMeta > 0 || (giftCardCaptured && giftCardAmountFromMeta > 0);
  await ensureWalletGiftBookingPayments(supabase, {
    bookingId: metadata.booking_id,
    tenantId: bookingData.tenant_id ?? financeTenantId ?? null,
    walletAmount: walletAmountFromMeta,
    giftCardAmount: giftCardCaptured ? giftCardAmountFromMeta : 0,
    initialStatus: splitWalletOrGift ? "pending" : "completed",
  });

  await supabase
    .from("payments")
    .update({
      status: "paid",
      payment_provider: "paystack",
      payment_provider_transaction_id: reference,
      processed_at: webhookNow,
      payment_provider_response: data,
    })
    .eq("booking_id", metadata.booking_id)
    .eq("payment_provider", "paystack")
    .eq("payment_provider_transaction_id", reference);

  if (!isSecondCharge) {
  await supabase.from("finance_transactions").insert({
    booking_id: metadata.booking_id,
    provider_id: bookingData.provider_id || null,
    tenant_id: financeTenantId,
    transaction_type: "payment",
    amount: commissionBase,
    fees: feesInCurrency,
    commission: platformCommission,
    net: platformCommission,
    description: `Payment for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });

  await supabase.from("finance_transactions").insert({
    booking_id: metadata.booking_id,
    provider_id: bookingData.provider_id || null,
    tenant_id: financeTenantId,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });

  // Customer-paid Platform Fee entry
  if (serviceFeeAmount > 0) {
    await supabase.from("finance_transactions").insert({
      booking_id: metadata.booking_id,
      provider_id: bookingData.provider_id || null,
      tenant_id: financeTenantId,
      transaction_type: "platform_fee",
      amount: serviceFeeAmount,
      fees: 0,
      commission: 0,
      net: serviceFeeAmount,
      description: `Platform fee for booking ${bookingData.booking_number}`,
      created_at: new Date().toISOString(),
    });
  }

  await supabase.from("finance_transactions").insert([
    ...(tipAmount > 0
      ? [{
          booking_id: metadata.booking_id,
          provider_id: bookingData.provider_id || null,
          tenant_id: financeTenantId,
          transaction_type: "tip",
          amount: tipAmount,
          fees: 0,
          commission: 0,
          net: tipAmount,
          description: `Tip for booking ${bookingData.booking_number}`,
          created_at: webhookNow,
        }]
      : []),
    ...(taxAmount > 0
      ? [{
          booking_id: metadata.booking_id,
          provider_id: bookingData.provider_id || null,
          tenant_id: financeTenantId,
          transaction_type: "tax",
          amount: taxAmount,
          fees: 0,
          commission: 0,
          net: 0,
          description: `Tax for booking ${bookingData.booking_number}`,
          created_at: webhookNow,
        }]
      : []),
    ...(travelFee > 0
      ? [
          {
            booking_id: metadata.booking_id,
            provider_id: bookingData.provider_id || null,
            tenant_id: financeTenantId,
            transaction_type: "travel_fee",
            amount: travelFee,
            fees: 0,
            commission: 0,
            net: travelFee,
            description: `Travel fee for booking ${bookingData.booking_number}`,
            created_at: webhookNow,
          },
        ]
      : []),
  ]);
  } else {
    // Scenario B: second Paystack charge for this booking. Booking-level rows
    // (platform_fee, tax, tip, travel) were already recorded for the first charge.
    // Only append the per-charge payment + provider_earnings rows.
    console.log(`[charge-success] Second charge detected for booking ${metadata.booking_id} (ref: ${reference}) — writing payment+earnings only.`);
    await supabase.from("finance_transactions").insert([
      {
        booking_id: metadata.booking_id,
        provider_id: bookingData.provider_id || null,
        tenant_id: financeTenantId,
        transaction_type: "payment",
        amount: commissionBase,
        fees: feesInCurrency,
        commission: platformCommission,
        net: platformCommission,
        description: `Payment (charge 2) for booking ${bookingData.booking_number}`,
        created_at: webhookNow,
      },
      {
        booking_id: metadata.booking_id,
        provider_id: bookingData.provider_id || null,
        tenant_id: financeTenantId,
        transaction_type: "provider_earnings",
        amount: subtractMoney(commissionBase, platformCommission),
        fees: 0,
        commission: 0,
        net: subtractMoney(commissionBase, platformCommission),
        description: `Provider earnings (charge 2) for booking ${bookingData.booking_number}`,
        created_at: webhookNow,
      },
    ]);
  }

  // For split wallet + card payments: record the wallet portion in the ledger.
  // The card portion is recorded above (payment + provider_earnings rows).
  // Check idempotency: only insert if no wallet_payment row exists yet for this booking.
  const walletAmountApplied = Number(metadata.wallet_amount_applied ?? 0);
  if (walletAmountApplied > 0) {
    const { data: existingWalletEntry } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", metadata.booking_id)
      .eq("transaction_type", "wallet_payment")
      .maybeSingle();
    if (!existingWalletEntry) {
      await supabase.from("finance_transactions").insert({
        booking_id: metadata.booking_id,
        provider_id: bookingData.provider_id || null,
        tenant_id: financeTenantId,
        transaction_type: "wallet_payment",
        amount: walletAmountApplied,
        fees: 0,
        commission: 0,
        net: walletAmountApplied,
        description: `Wallet contribution for booking ${bookingData.booking_number} (split payment)`,
        created_at: webhookNow,
      });
    }
  }

  // Gift card portion (split gift card + card payments)
  const giftCardAmountApplied = Number(metadata.gift_card_amount_applied ?? 0);
  if (giftCardAmountApplied > 0) {
    const { data: existingGcEntry } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", metadata.booking_id)
      .eq("transaction_type", "gift_card_payment")
      .maybeSingle();
    if (!existingGcEntry) {
      await supabase.from("finance_transactions").insert({
        booking_id: metadata.booking_id,
        provider_id: bookingData.provider_id || null,
        tenant_id: financeTenantId,
        transaction_type: "gift_card_payment",
        amount: giftCardAmountApplied,
        fees: 0,
        commission: 0,
        net: giftCardAmountApplied,
        description: `Gift card contribution for booking ${bookingData.booking_number} (split payment)`,
        created_at: webhookNow,
      });
    }

    // Keep gift-card liability rollforward balanced across all booking payment paths.
    const { data: existingGcLiabilityReduction } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", metadata.booking_id)
      .eq("transaction_type", "gift_card_liability_reduction")
      .maybeSingle();
    if (!existingGcLiabilityReduction) {
      await supabase.from("finance_transactions").insert({
        booking_id: metadata.booking_id,
        provider_id: bookingData.provider_id || null,
        tenant_id: financeTenantId,
        transaction_type: "gift_card_liability_reduction",
        amount: giftCardAmountApplied,
        fees: 0,
        commission: 0,
        net: -giftCardAmountApplied,
        description: `Gift card liability reduction for booking ${bookingData.booking_number} (split payment)`,
        created_at: webhookNow,
      });
    }
  }

  await completeWalletGiftSyntheticPayments(supabase, metadata.booking_id);

  // Promotions: record usage (idempotent) + dedicated discount ledger row
  try {
    const promoId = bookingData.promotion_id;
    const promoDiscount = Number(bookingData.promotion_discount_amount || 0);
    if (promoId && promoDiscount > 0) {
      await recordPromotionUsage(supabase, {
        promotionId: promoId,
        userId: bookingData.customer_id,
        bookingId: metadata.booking_id,
        discountAmount: promoDiscount,
      });

      // Finance ledger: record the discount as a negative revenue line so GMV vs net is
      // transparent in reports. Idempotent: only insert if no existing row for this booking.
      const { data: existingPromoEntry } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("booking_id", metadata.booking_id)
        .eq("transaction_type", "promotion_discount")
        .maybeSingle();
      if (!existingPromoEntry) {
        await supabase.from("finance_transactions").insert({
          booking_id: metadata.booking_id,
          provider_id: bookingData.provider_id || null,
          tenant_id: financeTenantId,
          transaction_type: "promotion_discount",
          amount: promoDiscount,
          fees: 0,
          commission: 0,
          net: -promoDiscount,
          description: `Promotion discount applied to booking ${bookingData.booking_number}`,
          created_at: new Date().toISOString(),
        });
      }
    }
  } catch (promoError) {
    const msg = promoError instanceof Error ? promoError.message : String(promoError);
    if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
      console.error("Error recording promotion usage:", promoError);
    }
  }

  // Membership & loyalty discount ledger parity (mirrors promotion_discount and the
  // custom-offer finalize path) so GMV vs net reconciles for every settlement path,
  // not only custom offers. Idempotent per (booking, transaction_type).
  try {
    const membershipDiscountAmount = Number(
      metadata?.membership_discount_amount ??
        (bookingData as { membership_discount_amount?: number }).membership_discount_amount ??
        0,
    );
    const loyaltyDiscountAmount = Number(
      metadata?.loyalty_discount_amount ??
        (bookingData as { loyalty_discount_amount?: number }).loyalty_discount_amount ??
        0,
    );

    const postContraRowOnce = async (
      transactionType: "membership_discount" | "loyalty_redemption",
      amount: number,
      description: string,
    ) => {
      if (!(amount > 0)) return;
      const { data: existing } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("booking_id", metadata.booking_id)
        .eq("transaction_type", transactionType)
        .maybeSingle();
      if (existing) return;
      await supabase.from("finance_transactions").insert({
        booking_id: metadata.booking_id,
        provider_id: bookingData.provider_id || null,
        tenant_id: financeTenantId,
        transaction_type: transactionType,
        amount,
        fees: 0,
        commission: 0,
        net: -amount,
        description,
        created_at: new Date().toISOString(),
      });
    };

    await postContraRowOnce(
      "membership_discount",
      membershipDiscountAmount,
      `Membership discount applied to booking ${bookingData.booking_number}`,
    );
    // Standard-path parity with finalize-custom-offer: loyalty is posted as a
    // loyalty_redemption contra row (net negative); not added to total_amount.
    await postContraRowOnce(
      "loyalty_redemption",
      loyaltyDiscountAmount,
      `Loyalty redemption applied to booking ${bookingData.booking_number}`,
    );
  } catch (discountLedgerError) {
    const msg =
      discountLedgerError instanceof Error ? discountLedgerError.message : String(discountLedgerError);
    if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
      console.error("Error recording membership/loyalty discount ledger rows:", discountLedgerError);
    }
  }

  try {
    await tryCreateCustomerRecurringFromPaystackChargeMetadata(
      supabase,
      metadata as Record<string, unknown> | undefined,
    );
  } catch (recurringErr) {
    console.error("[recurring] charge.success recurring hook:", recurringErr);
  }

  // Send OneSignal notifications
  try {
    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const { insertNotification } = await import("@/lib/notifications/insert-notification");

    await sendTemplateNotification(
      "payment_successful",
      [bookingData.customer_id],
      {
        amount: String(amountInCurrency),
        booking_number: bookingData.booking_number || String(metadata.booking_id ?? ""),
        booking_id: String(metadata.booking_id ?? ""),
        payment_method: "card",
      },
      ["push"],
      { appType: "customer", tenantId: bookingData.tenant_id ?? null },
    );
    await insertNotification({
      user_id: bookingData.customer_id,
      type: "payment_received",
      title: "Payment Confirmed",
      message: `Your payment for booking ${bookingData.booking_number} has been confirmed.`,
      data: {
        type: "payment_success",
        booking_id: metadata.booking_id,
      },
      action_url: "/account-settings/bookings",
    });

    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", bookingData.provider_id)
      .single();

    const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
    if (providerUserId) {
      await sendTemplateNotification(
        "payment_successful",
        [providerUserId],
        {
          amount: String(amountInCurrency),
          booking_number: bookingData.booking_number || String(metadata.booking_id ?? ""),
          booking_id: String(metadata.booking_id ?? ""),
          payment_method: "card",
        },
        ["push"],
        { appType: "provider", tenantId: bookingData.tenant_id ?? null },
      );
      await insertNotification({
        user_id: providerUserId,
        type: "payment_received",
        title: "New Booking Payment",
        message: `Payment received for booking ${bookingData.booking_number}.`,
        data: {
          type: "booking_payment",
          booking_id: metadata.booking_id,
        },
        action_url: `/provider/bookings/${metadata.booking_id}`,
      });
    }
  } catch (notifError) {
    console.error("Error sending notifications:", notifError);
  }

  // Track Amplitude event
  try {
    const lastResortSuccess = await lastResortCurrencyFromTenantId(bookingData.tenant_id, {
      supabase,
      providerId: bookingData.provider_id,
    });
    await trackServer(
      EVENT_PAYMENT_SUCCESS,
      {
        portal: "client",
        booking_id: metadata.booking_id,
        amount: amountInCurrency,
        currency: metadata?.currency || bookingData.currency || lastResortSuccess,
        payment_method: metadata?.save_card ? "saved_card" : "new_card",
        payment_provider: "paystack",
        transaction_id: reference,
      },
      bookingData.customer_id,
    );
  } catch (amplitudeError) {
    console.error("[Amplitude] Failed to track payment success:", amplitudeError);
  }

  console.log(`Booking ${metadata.booking_id} payment confirmed (${reference})`);
}

// ─── charge.failed internals ─────────────────────────────────────────────────

async function handleProductOrderChargeFailed(data: PaystackChargeData, supabase: SupabaseClient) {
  const { reference, metadata, amount } = data;
  if (!reference || !metadata?.product_order_id) return;

  const amountInCurrency = convertFromSmallestUnit(amount || 0);

  const productOrderId = String(metadata.product_order_id);

  const { data: order } = await (supabase.from("product_orders") as any)
    .select("id, customer_id, provider_id, tenant_id, wallet_amount, currency, payment_status, status")
    .eq("id", productOrderId)
    .maybeSingle();

  if (!order) return;
  const o = order as Record<string, unknown> & {
    id: string;
    customer_id: string;
    provider_id: string;
    tenant_id?: string | null;
    wallet_amount?: number | string | null;
    currency?: string | null;
    payment_status?: string;
  };

  if (o.payment_status !== "pending") return;

  await creditWalletForProductOrderIfNeeded(supabase, o, "Wallet refund (card payment failed)", "product_order_payment_failed");

  await restockProductOrderLineItems(supabase, o.id);

  await (supabase.from("product_orders") as any)
    .update({
      payment_status: "failed",
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "Card payment failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", o.id);

  try {
    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    await sendTemplateNotification(
      "payment_failed",
      [o.customer_id],
      {
        amount: String(amountInCurrency),
        booking_number: String(o.id),
        booking_id: String(o.id),
        failure_reason: "Card payment failed",
      },
      ["push"],
      { appType: "customer", tenantId: o.tenant_id ?? null },
    );
    await insertNotification({
      user_id: o.customer_id,
      type: "product_order_update",
      title: "Order Payment Failed",
      message: "Your product order payment did not go through. Please try again.",
      data: {
        type: "product_order_update",
        product_order_id: o.id,
      },
      action_url: "/product-orders",
    });
  } catch (notifError) {
    console.error("Error sending product-order payment failed notification:", notifError);
  }
}

/**
 * Recurring subscription renewal failed at the card charge layer (charge.failed).
 * Complements invoice.payment_failed / invoice.update — some flows only emit charge.failed.
 * Sets provider_subscriptions to past_due (grace handled by cron), records payment_transactions metadata, notifies once.
 */
async function handleSubscriptionRenewalChargeFailed(
  data: PaystackChargeData,
  subscriptionCode: string,
  supabase: SupabaseClient,
) {
  const { reference, amount, fees, message, gateway_response } = data;
  const paystackRef =
    reference ||
    `sub_renew_failed:${subscriptionCode}:${crypto.randomUUID()}`;

  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("provider", "paystack")
    .eq("reference", paystackRef)
    .maybeSingle();
  if (existingTx) {
    console.log(
      `Subscription renewal charge.failed already recorded for ref ${paystackRef}`,
    );
    return;
  }

  const { data: subRow } = await supabase
    .from("provider_subscriptions")
    .select("provider_id, plan_id, status, subscription_plans:plan_id(name)")
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();

  if (!subRow) {
    console.warn(
      `charge.failed: no provider_subscriptions row for subscription_code ${subscriptionCode}`,
    );
    return;
  }

  const prevStatus = (subRow as { status?: string }).status;
  if (prevStatus !== "active" && prevStatus !== "past_due") {
    console.log(
      `charge.failed: skip past_due handling for subscription ${subscriptionCode} (status=${prevStatus})`,
    );
    return;
  }

  const amountSmallest = amount ?? 0;
  const feesSmallest = fees ?? 0;
  const failureMeta = {
    source: "paystack_charge_failed",
    subscription_code: subscriptionCode,
    paystack_reference: reference ?? null,
    failure_reason: message || gateway_response || "paystack_charge_failed",
    failed_at: new Date().toISOString(),
    kind: "subscription_renewal",
  };

  await supabase
    .from("provider_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);

  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference: paystackRef,
    amount: convertFromSmallestUnit(amountSmallest),
    fees: convertFromSmallestUnit(feesSmallest),
    net_amount: convertFromSmallestUnit(amountSmallest - feesSmallest),
    status: "failed",
    provider: "paystack",
    transaction_type: "provider_subscription_payment",
    metadata: failureMeta,
    created_at: new Date().toISOString(),
  });

  if (prevStatus !== "active") {
    return;
  }

  try {
    const subData = subRow as {
      provider_id?: string;
      subscription_plans?: { name?: string } | null;
    };
    const { data: provider } = await supabase
      .from("providers")
      .select("user_id, business_name")
      .eq("id", subData.provider_id)
      .maybeSingle();
    if (provider) {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      await sendTemplateNotification(
        "subscription_payment_failed",
        [(provider as { user_id: string }).user_id],
        {
          business_name:
            (provider as { business_name?: string }).business_name || "Provider",
          plan_name: subData.subscription_plans?.name || "subscription",
          amount: `${convertFromSmallestUnit(amountSmallest)}`,
          app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
        },
        ["push"],
        { appType: "provider" },
      );
    }
  } catch (notifErr) {
    console.warn(
      "Failed to send subscription_payment_failed (charge.failed):",
      notifErr,
    );
  }
}

async function processFailedPayment(data: PaystackChargeData, supabase: SupabaseClient) {
  const { reference, metadata, message, gateway_response } = data;

  if (!reference || !metadata?.booking_id) {
    if (metadata?.product_order_id) {
      await handleProductOrderChargeFailed(data, supabase);
      return;
    }
    const subscriptionCode = extractPaystackSubscriptionCodeFromCharge(data);
    if (subscriptionCode) {
      await handleSubscriptionRenewalChargeFailed(data, subscriptionCode, supabase);
      return;
    }
    if (metadata?.custom_offer_id) {
      await handleCustomOfferFailed({ reference, metadata, message, gateway_response }, supabase);
      return;
    }
    if (metadata?.wallet_topup_id) {
      await handleWalletTopupFailed({ reference, metadata, message, gateway_response }, supabase);
      return;
    }
    if (metadata?.gift_card_order_id) {
      await handleGiftCardOrderFailed({ reference, metadata, message }, supabase);
      return;
    }
    if (metadata?.membership_order_id) {
      await handleMembershipOrderFailed({ reference, metadata, message }, supabase);
      return;
    }
    if (metadata?.provider_subscription_order_id) {
      await handleProviderSubscriptionOrderFailed({ reference, metadata, message }, supabase);
      return;
    }
    if (metadata?.ads_budget_order_id) {
      await supabase.from("ads_budget_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", metadata.ads_budget_order_id);
      return;
    }
    console.error("Missing reference or booking_id in payment data");
    return;
  }

  // Additional charge failure flow
  if (metadata?.additional_charge_id) {
    await handleAdditionalChargeFailed(
      { reference, metadata, message, gateway_response },
      supabase,
    );
    return;
  }

  if (metadata?.payment_type === "booking_remaining") {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, customer_id, booking_number, payment_status")
      .eq("id", metadata.booking_id)
      .maybeSingle();
    if (!booking) {
      console.error("Booking not found for booking_remaining charge.failed:", metadata.booking_id);
      return;
    }
    const currentStatus = (booking as { payment_status?: string }).payment_status;
    const nextPaymentStatus =
      currentStatus === "refunded" || currentStatus === "partially_refunded"
        ? currentStatus
        : currentStatus === "pending"
          ? "pending"
          : "partially_paid";
    await supabase
      .from("bookings")
      .update({
        payment_status: nextPaymentStatus,
        payment_reference: reference,
        payment_provider: "paystack",
        updated_at: new Date().toISOString(),
      })
      .eq("id", metadata.booking_id);

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      const bookingData = booking as { customer_id?: string; booking_number?: string; id?: string };
      if (bookingData.customer_id) {
        await sendToUser(
          bookingData.customer_id,
          {
            title: "Balance Payment Failed",
            message: `Your remaining balance payment for booking ${bookingData.booking_number ?? ""} failed. Please retry.`,
            data: { type: "booking_update", booking_id: bookingData.id },
            url: bookingData.id ? `/bookings/${bookingData.id}` : "/bookings",
          },
          ["push"],
          { appType: "customer" },
        );
        await insertNotification({
          user_id: bookingData.customer_id,
          type: "booking_update",
          title: "Balance Payment Failed",
          message: "Your remaining balance payment failed. Tap to retry.",
          data: { booking_id: bookingData.id },
          action_url: bookingData.id ? `/bookings/${bookingData.id}` : "/bookings",
        });
      }
    } catch (notifError) {
      console.error("Error sending booking_remaining failure notification:", notifError);
    }
    return;
  }

  // ── Standard booking failure ──────────────────────────────────────────────

  const { data: booking } = await supabase
    .from("bookings")
    .select("customer_id, booking_number, tenant_id, provider_id")
    .eq("id", metadata.booking_id)
    .single();

  if (!booking) {
    console.error("Booking not found:", metadata.booking_id);
    return;
  }

  const bookingData = booking as ChargeBookingRow;
  const lastResortFailed = await lastResortCurrencyFromTenantId(bookingData.tenant_id, {
    supabase,
    providerId: bookingData.provider_id,
  });

  const failedChargeWalletTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: bookingData.tenant_id,
    provider_id: bookingData.provider_id,
  });

  // If wallet was used as partial payment, refund it immediately.
  // §Wallet-refund (audit 2026-06): a duplicate charge.failed webhook previously
  // double-credited the wallet (no idempotency, RPC error swallowed). We now check
  // for an existing reversal credit on this booking before crediting, and only zero
  // out `wallet_amount` when the credit is confirmed (or already present).
  const walletAmountApplied = Number(metadata?.wallet_amount_applied ?? 0);
  if (walletAmountApplied > 0) {
    const { data: failedWallet } = await supabase
      .from("user_wallets")
      .select("id")
      .eq("user_id", bookingData.customer_id)
      .maybeSingle();

    const { data: existingReversal } = (failedWallet as { id?: string } | null)?.id
      ? await supabase
          .from("wallet_transactions")
          .select("id")
          .eq("wallet_id", (failedWallet as { id: string }).id)
          .eq("reference_id", metadata.booking_id)
          .eq("reference_type", "booking_payment_failed")
          .maybeSingle()
      : { data: null };

    if (existingReversal) {
      // Already reversed by a prior delivery — just ensure the booking no longer
      // claims a wallet portion.
      await supabase.from("bookings").update({ wallet_amount: 0 }).eq("id", metadata.booking_id);
    } else {
      const { error: reversalErr } = await supabase.rpc("wallet_credit_admin", {
        p_user_id: bookingData.customer_id,
        p_amount: walletAmountApplied,
        p_currency: metadata?.currency || lastResortFailed,
        p_description: `Wallet refund (payment failed) for booking ${bookingData.booking_number}`,
        p_reference_id: metadata.booking_id,
        p_reference_type: "booking_payment_failed",
        p_tenant_id: failedChargeWalletTenantId,
        p_idempotency_key: `booking_payment_failed:${metadata.booking_id}`,
      });

      if (reversalErr) {
        console.error("Failed to refund wallet on charge.failed:", reversalErr);
      } else {
        await supabase.from("bookings").update({ wallet_amount: 0 }).eq("id", metadata.booking_id);
      }
    }
  }

  // Gift cards: void reserved redemption and restore balance before the final
  // failed status update so payment-status triggers cannot leave stale coverage.
  try {
    await supabase.rpc("void_gift_card_redemption", {
      p_booking_id: metadata.booking_id,
    });
  } catch (gcError) {
    console.error("Error voiding gift card redemption:", gcError);
  }

  try {
    await supabase
      .from("booking_payments")
      .delete()
      .eq("booking_id", metadata.booking_id)
      .in("payment_provider_id", [
        `wallet_booking:${metadata.booking_id}`,
        `gift_card_booking:${metadata.booking_id}`,
      ]);
  } catch (paymentCleanupError) {
    console.error("Error cleaning synthetic booking payments after charge.failed:", paymentCleanupError);
  }

  // Update booking: mark payment as failed AND cancel the booking to release the slot
  const { error: updateError } = await supabase.from("bookings")
    .update({
      payment_status: "failed",
      payment_reference: reference,
      payment_provider: "paystack",
      status: "cancelled",
      cancellation_reason: "Payment failed",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", metadata.booking_id);

  if (updateError) {
    console.error("Error updating booking payment status:", updateError);
    throw updateError;
  }

  // Create payment transaction record
  await supabase.from("payment_transactions").insert({
    booking_id: metadata.booking_id,
    reference,
    amount: 0,
    fees: 0,
    net_amount: 0,
    status: "failed",
    provider: "paystack",
    metadata: {
      paystack_reference: reference,
      failure_reason: message,
    },
    created_at: new Date().toISOString(),
  });

  await supabase.from("payments")
    .update({
      status: "failed",
      payment_provider: "paystack",
      payment_provider_transaction_id: reference,
      failed_at: new Date().toISOString(),
      failure_reason: message || gateway_response || "paystack_charge_failed",
      payment_provider_response: data,
    })
    .eq("booking_id", metadata.booking_id)
    .eq("payment_provider", "paystack");

  // Notify customer
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");

    await sendToUser(
      bookingData.customer_id,
      {
        title: "Payment Failed",
        message: `Your payment for booking ${bookingData.booking_number} could not be processed. Please try again.`,
        data: {
          type: "payment_failed",
          booking_id: metadata.booking_id,
        },
        url: `/checkout`,
      },
      ["push"],
      { appType: "customer" }
    );
  } catch (notifError) {
    console.error("Error sending notification:", notifError);
  }

  // Track Amplitude event
  try {
    const amt = Number(metadata?.amount_to_collect || 0);
    await trackServer(
      EVENT_PAYMENT_FAILED,
      {
        portal: "client",
        booking_id: metadata.booking_id,
        amount: amt,
        currency: metadata?.currency || lastResortFailed,
        payment_method: metadata?.save_card ? "saved_card" : "new_card",
        payment_provider: "paystack",
        error_code: message || gateway_response || "unknown",
      },
      bookingData.customer_id,
    );
  } catch (amplitudeError) {
    console.error("[Amplitude] Failed to track payment failed:", amplitudeError);
  }

  console.log(`Booking ${metadata.booking_id} payment failed (${reference})`);
}

// ─── Custom Offer ────────────────────────────────────────────────────────────

/**
 * Thin wrapper around `finalizeCustomOfferPayment`.
 *
 * The actual finalize logic (booking creation, ledger entries, gift-card capture,
 * loyalty redemption, conversation messaging, push notifications) lives in
 * `@/lib/custom-offers/finalize-custom-offer-payment` so the same code path is
 * shared by the Paystack webhook, the `transaction/verify` short-circuit, and
 * the zero-Paystack path in `POST /api/me/custom-offers/:id/pay` (when
 * wallet + gift card cover the entire collectable).
 */
async function handleCustomOfferSuccess(
  payload: {
    reference: string;
    metadata: any;
    amount?: number;
    fees?: number;
    customer?: any;
    authorization?: any;
  },
  _supabase: SupabaseClient,
) {
  const offerId = payload.metadata?.custom_offer_id as string | undefined;
  if (!offerId || !payload.reference) return;

  const adminSupabase = getSupabaseAdmin();
  const result = await finalizeCustomOfferPaymentFromPaystackEvent(adminSupabase, {
    reference: payload.reference,
    metadata: payload.metadata ?? {},
    amount: payload.amount,
    fees: payload.fees,
    customer: payload.customer,
  });

  if (!result.ok) {
    console.warn("[handleCustomOfferSuccess] finalize did not succeed", {
      offerId,
      reference: payload.reference,
      reason: result.reason,
    });
  }

  // §custom-offer-save-card 2026-05: mirror the booking-success path — when
  // the customer opted into card saving for the new-card (hosted) checkout
  // flow, tokenize the returned authorization so the card shows up in their
  // saved payment methods on the next checkout. Safe to run regardless of
  // finalize outcome: the user was charged, and the card is reusable.
  const metadata = payload.metadata ?? {};
  const authorization = payload.authorization ?? null;
  const customer = payload.customer ?? null;
  const saveCardRequested =
    metadata?.save_card === true ||
    metadata?.save_card === "true" ||
    String(metadata?.save_card ?? "").toLowerCase() === "true";
  if (
    saveCardRequested &&
    authorization?.authorization_code &&
    authorization?.reusable &&
    customer?.email &&
    metadata?.customer_id
  ) {
    try {
      await savePaystackAuthorization({
        userId: String(metadata.customer_id),
        email: customer.email,
        authorizationCode: authorization.authorization_code,
        lastFour: authorization.last4,
        expiryMonth: parseInt(authorization.exp_month || "0"),
        expiryYear: parseInt(authorization.exp_year || "0"),
        cardBrand: authorization.brand || authorization.card_type || "unknown",
        isDefault:
          metadata?.set_as_default === true ||
          metadata?.set_as_default === "true" ||
          String(metadata?.set_as_default ?? "").toLowerCase() === "true",
        supabase: adminSupabase,
      });
    } catch (saveError) {
      console.error("[handleCustomOfferSuccess] saving payment method failed:", saveError);
    }
  }
}

async function handleCustomOfferFailed(
  payload: { reference: string; metadata: any; message?: string; gateway_response?: string },
  supabase: SupabaseClient,
) {
  const offerId = payload.metadata.custom_offer_id as string;
  if (!offerId) return;

  const admin = getSupabaseAdmin();
  await admin
    .from("custom_offers")
    .update({
      status: "pending",
      payment_url: null,
      payment_reference: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  await patchCustomOfferMessageAttachments(admin, offerId, { status: "pending" });

  try {
    const { data: offerRow } = await admin
      .from("custom_offers")
      .select("id, tenant_id, provider_id, currency, request:custom_requests(customer_id)")
      .eq("id", offerId)
      .maybeSingle();
    const offer = offerRow as {
      tenant_id?: string | null;
      provider_id?: string | null;
      currency?: string | null;
      request?: { customer_id?: string | null } | null;
    } | null;
    const customerId = offer?.request?.customer_id;
    if (!customerId) return;

    const walletAmountApplied = Number(payload.metadata?.wallet_amount_applied ?? 0);
    if (walletAmountApplied > 0) {
      const referenceType = `custom_offer_payment_failed:${payload.reference || offerId}`;
      const { data: wallet } = await admin
        .from("user_wallets")
        .select("id")
        .eq("user_id", customerId)
        .maybeSingle();
      const { data: existingRefund } = wallet?.id
        ? await admin
            .from("wallet_transactions")
            .select("id")
            .eq("wallet_id", wallet.id)
            .eq("reference_id", offerId)
            .eq("reference_type", referenceType)
            .maybeSingle()
        : { data: null };
      if (!existingRefund) {
        const walletTenantId = await resolveTenantIdForFinanceLedger(admin, {
          tenant_id: offer?.tenant_id ?? null,
          provider_id: offer?.provider_id ?? null,
        });
        await admin.rpc("wallet_credit_admin", {
          p_user_id: customerId,
          p_amount: walletAmountApplied,
          p_currency: String(payload.metadata?.currency ?? offer?.currency ?? LAST_RESORT_CURRENCY),
          p_description: `Wallet refund (custom offer payment failed)`,
          p_reference_id: offerId,
          p_reference_type: referenceType,
          p_tenant_id: walletTenantId,
        });
      }
    }

    const { sendToUser } = await import("@/lib/notifications/onesignal");
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    await sendToUser(
      customerId,
      {
        title: "Payment Failed",
        message: "Your custom offer payment did not go through. Please try again.",
        data: { type: "custom_offer", custom_offer_id: offerId },
        url: "/account-settings/custom-requests",
      },
      ["push"],
      { appType: "customer" },
    );
    await insertNotification({
      user_id: customerId,
      type: "custom_offer",
      title: "Payment Failed",
      message: "Your custom offer payment failed. Tap to try again.",
      data: { custom_offer_id: offerId },
      action_url: "/account-settings/custom-requests",
    });
  } catch (notifErr) {
    console.error("Error notifying customer for custom offer payment failure:", notifErr);
  }
}

// ─── Wallet Top-up ───────────────────────────────────────────────────────────

async function handleWalletTopupFailed(
  payload: { reference: string; metadata: any; message?: string; gateway_response?: string },
  supabase: SupabaseClient,
) {
  const topupId = payload.metadata.wallet_topup_id as string;
  if (!topupId) return;

  await supabase.from("wallet_topups")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: payload.message || payload.gateway_response || "Payment failed",
      paystack_reference: payload.reference,
      updated_at: new Date().toISOString(),
    })
    .eq("id", topupId);
}

// ─── Gift Card Order ─────────────────────────────────────────────────────────

async function handleGiftCardOrderSuccess(
  payload: { reference: string; metadata: any; amount: any },
  supabase: SupabaseClient,
) {
  const { reference, metadata, amount: _amount } = payload;
  const orderId = metadata.gift_card_order_id as string;

  const { data: order } = await supabase.from("gift_card_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (!order) return;

  type GiftOrderRow = {
    status?: string;
    gift_card_id?: string;
    currency?: string;
    amount?: number;
    quantity?: number;
    total_amount?: number;
    purchaser_user_id?: string;
    recipient_email?: string;
    provider_id?: string | null;
    tenant_id?: string | null;
    metadata?: {
      attribution?: Record<string, unknown>;
      template_id?: string;
      template_name?: string;
      template_image_url?: string;
    } | null;
  };
  const orderData = order as GiftOrderRow;
  if (orderData.status === "paid" && orderData.gift_card_id) return;

  let cardTenantId: string | null = orderData.tenant_id ?? null;
  if (!cardTenantId && orderData.provider_id) {
    const { data: prov } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", orderData.provider_id)
      .maybeSingle();
    cardTenantId = (prov as { tenant_id?: string } | null)?.tenant_id ?? null;
  }

  const giftOrderFinanceTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: cardTenantId,
    provider_id: orderData.provider_id ?? null,
  });

  const currency =
    orderData.currency || (await lastResortCurrencyFromTenantId(giftOrderFinanceTenantId));
  const value = Number(orderData.amount || 0);
  const quantity = Number(orderData.quantity || metadata.quantity || 1);
  const totalAmount = Number(orderData.total_amount || value * quantity);

  // §Gift-purchase (audit 2026-06): validate that Paystack actually charged the
  // order total before issuing cards. Issuing full value on an underpayment would
  // hand out more gift-card liability than was collected.
  const paidAmount = convertFromSmallestUnit(Number(_amount) || 0);
  if (paidAmount > 0 && paidAmount + 0.01 < totalAmount) {
    console.error(
      `[gift_card_order] CRITICAL: paid amount ${paidAmount} is less than order total ${totalAmount} for order ${orderId} — not issuing cards.`,
    );
    await supabase
      .from("gift_card_orders")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
        metadata: { ...(orderData.metadata ?? {}), underpayment: { paid: paidAmount, expected: totalAmount } },
      })
      .eq("id", orderId)
      .neq("status", "paid");
    return;
  }

  // §Gift-purchase (audit 2026-06): ATOMIC idempotency claim. The webhook and the
  // client verify endpoint both call this handler, so a concurrent pair could
  // both pass the status read above and issue DUPLICATE cards for one payment.
  // payment_transactions has UNIQUE(provider, reference); inserting it FIRST means
  // only one caller wins the claim and proceeds to issue. The loser exits cleanly.
  const { error: claimError } = await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: totalAmount,
    fees: 0,
    net_amount: totalAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "gift_card_order",
      gift_card_order_id: orderId,
      quantity,
    },
    created_at: new Date().toISOString(),
  });
  if (claimError) {
    if ((claimError as { code?: string }).code === "23505") {
      console.log(
        `[gift_card_order] reference ${reference} already claimed — skipping duplicate issuance.`,
      );
      return;
    }
    throw new Error(`Failed to claim gift card order ${orderId}: ${claimError.message}`);
  }
  const attribution =
    metadata?.attribution && typeof metadata.attribution === "object"
      ? metadata.attribution
      : orderData.metadata?.attribution && typeof orderData.metadata.attribution === "object"
        ? orderData.metadata.attribution
        : undefined;
  const templateMetadata = {
    template_id:
      typeof metadata?.template_id === "string"
        ? metadata.template_id
        : typeof orderData.metadata?.template_id === "string"
          ? orderData.metadata.template_id
          : undefined,
    template_name:
      typeof metadata?.template_name === "string"
        ? metadata.template_name
        : typeof orderData.metadata?.template_name === "string"
          ? orderData.metadata.template_name
          : undefined,
    template_image_url:
      typeof metadata?.template_image_url === "string"
        ? metadata.template_image_url
        : typeof orderData.metadata?.template_image_url === "string"
          ? orderData.metadata.template_image_url
          : undefined,
  };

  const giftCardIds: string[] = [];
  const giftCardCodes: string[] = [];

  for (let i = 0; i < quantity; i++) {
    let code = generateGiftCardCode();
    for (let j = 0; j < 5; j++) {
      const { data: existing } = await supabase.from("gift_cards")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateGiftCardCode();
    }

    const { data: card, error: cardError } = await supabase.from("gift_cards")
      .insert({
        code,
        currency,
        initial_balance: value,
        balance: value,
        is_active: true,
        tenant_id: giftOrderFinanceTenantId,
        metadata: {
          source: "purchase",
          order_id: orderId,
          purchaser_user_id: orderData.purchaser_user_id,
          recipient_email: orderData.recipient_email,
          paystack_reference: reference,
          bulk_order_index: quantity > 1 ? i + 1 : null,
          bulk_order_total: quantity > 1 ? quantity : null,
          attribution,
          ...templateMetadata,
        },
      })
      .select("*")
      .single();

    if (cardError || !card) {
      console.error(`Failed to issue gift card ${i + 1} of ${quantity}:`, cardError);
      continue;
    }

    giftCardIds.push((card as { id: string }).id);
    giftCardCodes.push(code);
  }

  if (giftCardIds.length === 0) {
    // Total issuance failure: release the idempotency claim so a webhook retry can
    // re-attempt (otherwise the customer is charged with zero cards and no retry).
    await supabase
      .from("payment_transactions")
      .delete()
      .eq("provider", "paystack")
      .eq("reference", reference);
    throw new Error("Failed to issue any gift cards");
  }

  // §Gift-purchase (audit 2026-06): surface partial issuance instead of silently
  // marking a bulk order fully paid when fewer cards than purchased were issued.
  const fullyIssued = giftCardIds.length === quantity;
  if (!fullyIssued) {
    console.error(
      `[gift_card_order] CRITICAL: issued ${giftCardIds.length}/${quantity} cards for order ${orderId} — manual issuance of the remainder required.`,
    );
  }

  await supabase
    .from("gift_card_orders")
    .update({
      status: "paid",
      gift_card_id: giftCardIds[0],
      updated_at: new Date().toISOString(),
      tenant_id: giftOrderFinanceTenantId,
      metadata: {
        ...(orderData.metadata ?? {}),
        issued_count: giftCardIds.length,
        expected_count: quantity,
        ...(fullyIssued ? {} : { partial_issuance: true }),
      },
    })
    .eq("id", orderId);

  // The payment_transactions claim row was inserted before issuance; enrich it
  // with the issued card ids for reconciliation/notifications.
  await supabase
    .from("payment_transactions")
    .update({
      metadata: {
        kind: "gift_card_order",
        gift_card_order_id: orderId,
        gift_card_ids: giftCardIds,
        quantity: quantity,
        issued_count: giftCardIds.length,
        attribution,
        ...templateMetadata,
      },
    })
    .eq("provider", "paystack")
    .eq("reference", reference);

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: orderData.provider_id ?? null,
    tenant_id: giftOrderFinanceTenantId,
    transaction_type: "gift_card_sale",
    amount: totalAmount,
    fees: 0,
    commission: 0,
    net: totalAmount,
    description: `Platform gift card sale (${quantity} card${quantity > 1 ? "s" : ""}) - liability until redemption`,
    created_at: new Date().toISOString(),
  });

  // Notify purchaser (best-effort)
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    if (orderData.purchaser_user_id) {
      const notifMessage =
        quantity === 1
          ? `Your gift card code is ${giftCardCodes[0]}.`
          : `You purchased ${quantity} gift cards. Codes: ${giftCardCodes.join(", ")}`;

      await sendToUser(
        orderData.purchaser_user_id,
        {
          title: quantity === 1 ? "Gift Card Purchased" : `${quantity} Gift Cards Purchased`,
          message: notifMessage,
          data: {
            type: "gift_card_issued",
            gift_card_ids: giftCardIds,
            codes: giftCardCodes,
            quantity: quantity,
          },
          url: `/account-settings/payments`,
        },
        ["push"],
        { appType: "customer" }
      );
    }
  } catch (e) {
    console.error("Error notifying gift card purchaser:", e);
  }

  // Deliver the gift to the recipient when an email was supplied at purchase.
  // Email is sent to anyone (registered or not); registered recipients also get
  // a push + the card already appears in their wallet list via recipient_email.
  try {
    const recipientEmail =
      typeof orderData.recipient_email === "string" ? orderData.recipient_email.trim() : "";
    if (recipientEmail) {
      const orderMeta = (orderData.metadata ?? {}) as {
        recipient_name?: string | null;
        message?: string | null;
      };
      const recipientName =
        typeof metadata?.recipient_name === "string"
          ? metadata.recipient_name
          : (orderMeta.recipient_name ?? null);
      const giftMessage =
        typeof metadata?.message === "string" ? metadata.message : (orderMeta.message ?? null);
      const { deliverGiftCardToRecipient } = await import(
        "@/lib/notifications/gift-card-recipient-delivery"
      );
      await deliverGiftCardToRecipient({
        supabase,
        orderId,
        recipientEmail,
        recipientName,
        message: giftMessage,
        purchaserUserId: orderData.purchaser_user_id ?? null,
        codes: giftCardCodes,
        perCardAmount: value,
        currency,
        tenantId: giftOrderFinanceTenantId,
      });
    }
  } catch (e) {
    console.error("Error delivering gift card to recipient:", e);
  }
}

async function handleGiftCardOrderFailed(
  payload: { reference: string; metadata: any; message: any },
  supabase: SupabaseClient,
) {
  const orderId = payload.metadata.gift_card_order_id as string;
  await supabase.from("gift_card_orders")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

// ─── Membership Order ────────────────────────────────────────────────────────

async function handleMembershipOrderSuccess(
  payload: { reference: string; metadata: any; amount?: number; fees?: number },
  supabase: SupabaseClient,
) {
  const { metadata } = payload;
  const orderId = metadata.membership_order_id as string;

  const { data: order } = await supabase
    .from("membership_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (!order) return;
  type MembershipOrderRow = {
    status?: string;
    provider_id?: string;
    user_id?: string;
    plan_id?: string;
    amount?: number;
    metadata?: { attribution?: Record<string, unknown> } | null;
  };
  const orderData = order as MembershipOrderRow;
  if (orderData.status === "paid") return;
  const attribution =
    metadata?.attribution && typeof metadata.attribution === "object"
      ? metadata.attribution
      : orderData.metadata?.attribution && typeof orderData.metadata.attribution === "object"
        ? orderData.metadata.attribution
        : undefined;

  const { data: planRow } = await (supabase.from("membership_plans") as any)
    .select("id, provider_id")
    .eq("id", orderData.plan_id)
    .maybeSingle();
  const planProviderId = (planRow as { provider_id?: string | null } | null)?.provider_id ?? null;
  if (!planProviderId) {
    console.error("Membership plan missing or has no provider:", orderData.plan_id);
    return;
  }
  if (orderData.provider_id && orderData.provider_id !== planProviderId) {
    console.error("Membership order/provider mismatch:", {
      orderId,
      orderProviderId: orderData.provider_id,
      planProviderId,
      planId: orderData.plan_id,
    });
    return;
  }
  const providerId = planProviderId;
  const grossAmount =
    typeof payload.amount === "number"
      ? convertFromSmallestUnit(payload.amount)
      : Number(orderData.amount || 0);
  const feeAmount =
    typeof payload.fees === "number"
      ? convertFromSmallestUnit(payload.fees)
      : 0;
  const netAmount = Math.max(0, grossAmount - feeAmount);

  const membershipFinanceTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });

  const now = new Date();
  const { data: existingMembership } = await (supabase.from("user_memberships") as any)
    .select("id, status, started_at, expires_at")
    .eq("user_id", orderData.user_id)
    .eq("provider_id", providerId)
    .maybeSingle();
  const existing = existingMembership as
    | { status?: string | null; started_at?: string | null; expires_at?: string | null }
    | null;
  const existingExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
  const existingExpiryValid = Boolean(existingExpiry && Number.isFinite(existingExpiry.getTime()));
  const hasFutureActiveTerm =
    existing?.status === "active" &&
    existingExpiryValid &&
    (existingExpiry as Date).getTime() > now.getTime();
  const renewalStart = hasFutureActiveTerm ? (existingExpiry as Date) : now;
  const expiresAt = new Date(renewalStart);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  const startedAt =
    hasFutureActiveTerm && existing?.started_at ? existing.started_at : now.toISOString();

  await supabase.from("user_memberships").upsert(
    {
      user_id: orderData.user_id,
      provider_id: providerId,
      plan_id: orderData.plan_id,
      status: "active",
      started_at: startedAt,
      expires_at: expiresAt.toISOString(),
      metadata: { source: "purchase", membership_order_id: orderId, attribution },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider_id" },
  );

  await supabase
    .from("membership_orders")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", orderId);

  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference: payload.reference,
    amount: grossAmount,
    fees: feeAmount,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "membership_order",
      membership_order_id: orderId,
      plan_id: orderData.plan_id,
      provider_id: orderData.provider_id,
      attribution,
    },
    created_at: new Date().toISOString(),
  });

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: membershipFinanceTenantId,
    transaction_type: "membership_sale",
    amount: grossAmount,
    fees: feeAmount,
    commission: 0,
    net: 0,
    description: `Membership sale (gross)`,
    created_at: new Date().toISOString(),
  });

  if (providerId) {
    await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: providerId,
      tenant_id: membershipFinanceTenantId,
      transaction_type: "provider_earnings",
      amount: grossAmount,
      fees: feeAmount,
      commission: 0,
      net: netAmount,
      description: `Provider earnings from membership sale`,
      created_at: new Date().toISOString(),
    });
  }

  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      orderData.user_id,
      {
        title: "Membership Activated",
        message: "Your membership has been activated.",
        data: {
          type: "membership_activated",
          provider_id: orderData.provider_id,
          plan_id: orderData.plan_id,
        },
        url: `/account-settings`,
      },
      ["push"],
      { appType: "customer" }
    );
  } catch (e) {
    console.error("Membership activation notification failed:", e);
  }
}

async function handleMembershipOrderFailed(
  payload: { reference: string; metadata: any; message: any },
  supabase: SupabaseClient,
) {
  const orderId = payload.metadata.membership_order_id as string;
  await supabase.from("membership_orders")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

// ─── Provider Subscription Order ─────────────────────────────────────────────

async function handleProviderSubscriptionOrderSuccess(
  payload: { reference: string; metadata: any; amount: any; fees: any; customer: any },
  supabase: SupabaseClient,
) {
  const { reference, metadata, amount, fees } = payload;
  const orderId = metadata.provider_subscription_order_id as string;

  const { data: order } = await supabase.from("provider_subscription_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) return;
  type SubOrderRow = { status?: string; provider_id?: string; plan_id?: string; billing_period?: string };
  const orderData = order as SubOrderRow;
  if (orderData.status === "paid") return;

  const providerId = orderData.provider_id as string;
  const planId = orderData.plan_id as string;
  const billingPeriod = (orderData.billing_period ?? "monthly") as "monthly" | "yearly";

  const providerSubOrderFinanceTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });

  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  await supabase.from("provider_subscription_orders")
    .update({
      status: "paid",
      paystack_reference: reference,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  const now = new Date();
  const expiresAt = new Date(now);
  if (billingPeriod === "yearly") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  else expiresAt.setMonth(expiresAt.getMonth() + 1);

  await supabase.from("provider_subscriptions").upsert(
    {
      provider_id: providerId,
      tenant_id: providerSubOrderFinanceTenantId,
      plan_id: planId,
      status: "active",
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      cancelled_at: null,
      billing_period: billingPeriod,
      auto_renew: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id" },
  );

  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "provider_subscription_order",
      provider_subscription_order_id: orderId,
      provider_id: providerId,
      plan_id: planId,
    },
    created_at: new Date().toISOString(),
  });

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: providerSubOrderFinanceTenantId,
    transaction_type: "provider_subscription_payment",
    amount: netAmount,
    fees: feesInCurrency,
    commission: 0,
    net: netAmount,
    description: `Provider subscription payment`,
    created_at: new Date().toISOString(),
  });

  try {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("name")
      .eq("id", planId)
      .maybeSingle();
    const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
    await notifyProviderTeamUsers(providerId, {
      type: "subscription_update",
      title: "Subscription payment confirmed",
      message: `Your ${(plan as { name?: string } | null)?.name ?? "subscription"} payment is complete.`,
      data: {
        provider_subscription_order_id: orderId,
        plan_id: planId,
        amount: amountInCurrency,
      },
      action_url: "/provider/subscription",
    });
  } catch (notificationError) {
    console.warn("Provider subscription payment notification failed:", notificationError);
  }
}

async function handleProviderSubscriptionOrderFailed(
  payload: { reference: string; metadata: any; message: any },
  supabase: SupabaseClient,
) {
  const orderId = payload.metadata.provider_subscription_order_id as string;
  await supabase.from("provider_subscription_orders")
    .update({
      status: "failed",
      paystack_reference: payload.reference,
      failed_at: new Date().toISOString(),
      failure_reason: payload.message || "Payment failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
}

// ─── Ads budget order (pre-pay for campaign) ──────────────────────────────────

async function handleAdsBudgetOrderSuccess(
  payload: { reference: string; metadata: any; amount: number; fees: number },
  supabase: SupabaseClient,
) {
  const orderId = String(payload.metadata?.ads_budget_order_id ?? "").trim();
  if (!orderId) {
    console.error("[ads_budget_order] missing ads_budget_order_id in charge metadata");
    return;
  }

  const { data: order } = await supabase
    .from("ads_budget_orders")
    .select("id, amount, status, campaign_id, provider_id")
    .eq("id", orderId)
    .single();

  if (!order || (order as { status?: string }).status === "paid") {
    return;
  }

  const row = order as { provider_id?: string | null; campaign_id?: string | null };
  const providerId = String(row.provider_id || payload.metadata?.provider_id || "").trim();
  const campaignId = String(row.campaign_id || payload.metadata?.campaign_id || "").trim();
  if (!providerId || !campaignId) {
    console.error("[ads_budget_order] missing provider_id or campaign_id on order row + metadata", {
      orderId,
      row,
    });
    return;
  }

  const amountMajor = convertFromSmallestUnit(Number(payload.amount || 0));
  const expectedMajor = Number((order as { amount?: number | string | null }).amount ?? 0);
  const statusStr = String((order as { status?: string }).status ?? "");
  if (statusStr !== "paid" && Math.abs(amountMajor - expectedMajor) > 0.02) {
    console.error("[ads_budget_order] Paystack amount does not match ads_budget_orders.amount", {
      orderId,
      paystackAmountMajor: amountMajor,
      expectedMajor,
      reference: payload.reference,
    });
    return;
  }

  const amountInCurrency = amountMajor;
  const feesInCurrency = convertFromSmallestUnit(payload.fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  const adsBudgetFinanceTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });

  await supabase.from("ads_budget_orders")
    .update({
      status: "paid",
      paystack_reference: payload.reference,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  // Check billing model — prepaid fixed products should start after payment.
  const { data: campaignRow } = await supabase
    .from("ads_campaigns")
    .select("billing_model, duration_days")
    .eq("id", campaignId)
    .single();

  const campaignUpdate: Record<string, any> = {
    budget: amountInCurrency,
    updated_at: new Date().toISOString(),
  };

  if ((campaignRow as any)?.billing_model === "time_based") {
    const now = new Date();
    const days = Number((campaignRow as any).duration_days) || 7;
    campaignUpdate.status = "active";
    campaignUpdate.start_at = now.toISOString();
    campaignUpdate.end_at = new Date(now.getTime() + days * 86400000).toISOString();
  } else if ((campaignRow as any)?.billing_model === "impression_pack") {
    campaignUpdate.status = "active";
    campaignUpdate.start_at = new Date().toISOString();
  } else if ((campaignRow as any)?.billing_model === "cpc_budget") {
    campaignUpdate.status = "active";
    campaignUpdate.start_at = new Date().toISOString();
  }

  await supabase.from("ads_campaigns")
    .update(campaignUpdate)
    .eq("id", campaignId)
    .eq("provider_id", providerId);

  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference: payload.reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "ads_budget_order",
      ads_budget_order_id: orderId,
      provider_id: providerId,
      campaign_id: campaignId,
    },
    created_at: new Date().toISOString(),
  });

  const billingLabel = (campaignRow as any)?.billing_model === "time_based"
    ? `Ads time-based boost (${(campaignRow as any)?.duration_days ?? "N"} days)`
    : "Ads campaign budget (pre-pay)";

  await supabase.from("finance_transactions").insert({
    booking_id: null,
    provider_id: providerId,
    tenant_id: adsBudgetFinanceTenantId,
    transaction_type: "provider_ads_payment",
    amount: amountInCurrency,
    fees: feesInCurrency,
    commission: 0,
    net: netAmount,
    description: billingLabel,
    created_at: new Date().toISOString(),
  });

  try {
    const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
    await notifyProviderTeamUsers(providerId, {
      type: "ads_payment_confirmed",
      title: "Ad payment confirmed",
      message: `${billingLabel} payment confirmed. Your campaign is funded.`,
      data: {
        ads_budget_order_id: orderId,
        campaign_id: campaignId,
        amount: amountInCurrency,
      },
      action_url: "/provider/settings/ads",
    });
  } catch (notificationError) {
    console.warn("Ads payment notification failed:", notificationError);
  }
}

// ─── Customer standalone card verification (profile → add card) ─────────────

async function handleCustomerCardVerificationSuccess(
  payload: {
    reference: string;
    metadata: Record<string, unknown>;
    amount: number;
    fees: number;
    customer: PaystackChargeData["customer"];
    authorization?: PaystackChargeData["authorization"];
  },
  supabase: SupabaseClient,
): Promise<void> {
  const { reference, metadata, amount, fees, customer, authorization } = payload;
  const customerId = typeof metadata.customer_id === "string" ? metadata.customer_id : null;
  if (!customerId) {
    console.error("[card_verification] missing customer_id in metadata");
    return;
  }

  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("provider", "paystack")
    .eq("reference", reference)
    .maybeSingle();
  if (existingTx) {
    return;
  }

  const saveCardRequested =
    metadata.save_card === true ||
    metadata.save_card === "true" ||
    String(metadata.save_card ?? "").toLowerCase() === "true";
  const setAsDefault =
    metadata.set_as_default === true ||
    metadata.set_as_default === "true" ||
    String(metadata.set_as_default ?? "").toLowerCase() === "true";

  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;
  const email = customer?.email;
  const authCode = authorization?.authorization_code;
  const reusable = authorization?.reusable === true;

  if (saveCardRequested && authCode && reusable && email) {
    try {
      await savePaystackAuthorization({
        userId: customerId,
        email,
        authorizationCode: authCode,
        lastFour: String(authorization?.last4 ?? "0000"),
        expiryMonth: parseInt(String(authorization?.exp_month ?? "0"), 10),
        expiryYear: parseInt(String(authorization?.exp_year ?? "0"), 10),
        cardBrand: String(authorization?.brand ?? authorization?.card_type ?? "unknown"),
        isDefault: setAsDefault,
        supabase,
      });
    } catch (e) {
      console.error("[card_verification] savePaystackAuthorization failed:", e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  } else if (saveCardRequested) {
    console.warn(
      "[card_verification] charge succeeded but card not saved (missing reusable auth or email)",
      { reference, hasAuth: Boolean(authCode), reusable, hasEmail: Boolean(email) },
    );
  }

  const { error: paymentTxInsertError } = await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "card_verification",
      customer_id: customerId,
      saved_card: Boolean(saveCardRequested && authCode && reusable && email),
    },
    created_at: new Date().toISOString(),
  });
  if (paymentTxInsertError) {
    if (paymentTxInsertError.code === "23505") {
      console.log(`[card_verification] Paystack ref ${reference} was recorded concurrently`);
      return;
    }
    throw paymentTxInsertError;
  }
}

// ─── Subscription Authorization ──────────────────────────────────────────────

async function handleSubscriptionAuthorizationSuccess(
  payload: {
    reference: string;
    metadata: any;
    amount: number;
    fees: number;
    customer: any;
    authorization?: any;
  },
  supabase: SupabaseClient,
) {
  const { reference, metadata, amount, fees, authorization } = payload;
  const orderId = metadata.provider_subscription_order_id as string;
  const providerId = metadata.provider_id as string;
  const planId = metadata.plan_id as string;
  const billingPeriod = (metadata.billing_period || "monthly") as "monthly" | "yearly";
  const customerCode = metadata.customer_code as string;

  if (!orderId || !providerId || !planId) {
    console.error("Missing required metadata for subscription authorization");
    return;
  }

  const authCode = authorization?.authorization_code;
  if (!authCode || !authorization?.reusable) {
    console.error("No reusable authorization code in payment response");
    return;
  }

  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  const subscriptionAuthTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: null,
    provider_id: providerId,
  });

  await supabase.from("provider_subscription_orders")
    .update({
      status: "paid",
      paystack_reference: reference,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  const { data: existingSub } = await supabase
    .from("provider_subscriptions")
    .select("id")
    .eq("provider_id", providerId)
    .single();

  if (existingSub) {
    await supabase.from("provider_subscriptions")
      .update({
        paystack_authorization_code: authCode,
        paystack_customer_code: customerCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existingSub as { id: string }).id);
  } else {
    await supabase.from("provider_subscriptions").insert({
      provider_id: providerId,
      tenant_id: subscriptionAuthTenantId,
      plan_id: planId,
      status: "pending",
      billing_period: billingPeriod,
      auto_renew: false,
      paystack_authorization_code: authCode,
      paystack_customer_code: customerCode,
      updated_at: new Date().toISOString(),
    });
  }

  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "subscription_authorization",
      provider_subscription_order_id: orderId,
      provider_id: providerId,
      plan_id: planId,
      authorization_code: authCode,
    },
    created_at: new Date().toISOString(),
  });

  // Now automatically create the Paystack subscription
  try {
    const { createSubscription } = await import("@/lib/payments/paystack-complete");
    const paystackPlanCode =
      billingPeriod === "yearly"
        ? (
            await supabase
              .from("subscription_plans")
              .select("paystack_plan_code_yearly")
              .eq("id", planId)
              .single()
          ).data?.paystack_plan_code_yearly
        : (
            await supabase
              .from("subscription_plans")
              .select("paystack_plan_code_monthly")
              .eq("id", planId)
              .single()
          ).data?.paystack_plan_code_monthly;

    if (paystackPlanCode) {
      const subscriptionResponse = await createSubscription({
        customer: customerCode,
        plan: paystackPlanCode,
        authorization: authCode,
      });

      const paystackSubscription = subscriptionResponse.data;

      await supabase.from("provider_subscriptions")
        .update({
          status: "active",
          paystack_subscription_code: paystackSubscription?.subscription_code,
          next_payment_date: paystackSubscription?.next_payment_date
            ? new Date(paystackSubscription.next_payment_date).toISOString()
            : null,
          started_at: new Date().toISOString(),
          auto_renew: true,
          updated_at: new Date().toISOString(),
        })
        .eq("provider_id", providerId);
    } else {
      const now = new Date();
      const expiresAt = new Date(now);
      if (billingPeriod === "yearly") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      else expiresAt.setMonth(expiresAt.getMonth() + 1);

      await supabase.from("provider_subscriptions")
        .update({
          status: "active",
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          auto_renew: false,
          paystack_sync_pending: false,
          paystack_sync_note: null,
          updated_at: new Date().toISOString(),
        })
        .eq("provider_id", providerId);
    }

    try {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("name")
        .eq("id", planId)
        .maybeSingle();
      const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
      await notifyProviderTeamUsers(providerId, {
        type: "subscription_update",
        title: "Subscription activated",
        message: `${(plan as { name?: string } | null)?.name ?? "Your subscription"} is active.`,
        data: {
          provider_subscription_order_id: orderId,
          plan_id: planId,
        },
        action_url: "/provider/subscription",
      });
    } catch (notificationError) {
      console.warn("Subscription activation notification failed:", notificationError);
    }
  } catch (err: unknown) {
    console.error("Failed to create Paystack subscription after authorization:", err);
  }
}

// ─── Pay remaining balance (deposit-only bookings) ───────────────────────────

async function handleBookingRemainingSuccess(
  payload: { reference: string; metadata: any; amount: any; fees: any; customer: any },
  supabase: SupabaseClient,
) {
  const { reference, metadata, amount, fees, customer } = payload;
  const bookingId = metadata.booking_id as string;

  const { data: existingPayment } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", "paystack")
    .eq("payment_provider_id", reference)
    .maybeSingle();
  if (existingPayment) {
    console.log(`Pay-remaining payment ${reference} already recorded`);
    return;
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) {
    // B2: pay-remaining success with unknown booking. Money was taken, so
    // throw to force Paystack retry rather than silently returning 200.
    const err = new Error(
      `pay-remaining charge.success: booking ${bookingId} not found (reference=${reference})`
    );
    (err as Error & { cause?: unknown }).cause = bookingError ?? null;
    throw err;
  }
  const bookingData = booking as ChargeBookingRow;
  const providerId = bookingData.provider_id ?? null;

  const payRemainingFinanceTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: bookingData.tenant_id as string | null | undefined,
    provider_id: bookingData.provider_id as string | null | undefined,
  });

  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);

  const { error: bookingPaymentInsertError } = await supabase
    .from("booking_payments")
    .insert({
      booking_id: bookingId,
      tenant_id: payRemainingFinanceTenantId,
      amount: amountInCurrency,
      payment_method: "card",
      payment_provider: "paystack",
      payment_provider_id: reference,
      payment_provider_data: { metadata, customer_email: customer?.email },
      status: "completed",
      notes: `Remaining balance paid via Paystack. Ref: ${reference}`,
    });
  if (bookingPaymentInsertError) {
    if (bookingPaymentInsertError.code === "23505") {
      console.log(
        `Pay-remaining payment ${reference} already recorded (unique index / concurrent webhook)`,
      );
      return;
    }
    console.error("Pay-remaining: booking_payments insert failed", bookingPaymentInsertError);
    return;
  }

  const walletAmountFromMeta = Number(metadata?.wallet_amount_applied ?? 0);
  const giftCardAmountFromMeta = Number(metadata?.gift_card_amount_applied ?? 0);
  if (giftCardAmountFromMeta > 0) {
    try {
      await supabase.rpc("capture_gift_card_redemption", { p_booking_id: bookingId });
    } catch (giftCaptureErr) {
      console.error("[pay-remaining] gift card capture failed:", giftCaptureErr);
    }
  }
  await completeWalletGiftSyntheticPayments(supabase, bookingId);

  const commissionRate = await resolveCommissionPercentageForProvider(supabase, {
    tenantId: bookingData.tenant_id ?? payRemainingFinanceTenantId ?? null,
    providerId,
  });
  const tipAmount = Number(metadata?.tip_amount ?? bookingData.tip_amount ?? 0);
  const taxAmount = Number(metadata?.tax_amount ?? bookingData.tax_amount ?? 0);
  const travelFee = Number(metadata?.travel_fee ?? bookingData.travel_fee ?? 0);
  const serviceFeeAmount = Number(
    metadata?.service_fee_amount ??
      ((bookingData as Record<string, unknown>).platform_fee_amount ||
        bookingData.service_fee_amount ||
        bookingData.platform_service_fee ||
        0),
  );
  const bookingTotal = Number(bookingData.total_amount || 0);
  const fullCommissionBase =
    bookingTotal > 0
      ? bookingTotal - tipAmount - taxAmount - travelFee - serviceFeeAmount
      : amountInCurrency;
  const netRevenueRatio =
    bookingTotal > 0 ? Math.max(0, fullCommissionBase / bookingTotal) : 1;
  const totalCollectedForCommission =
    amountInCurrency + walletAmountFromMeta + giftCardAmountFromMeta;
  const commissionBase = Math.max(
    0,
    Math.round(totalCollectedForCommission * netRevenueRatio * 100) / 100,
  );
  const platformCommission = commissionRate > 0 ? percentOf(commissionBase, commissionRate) : 0;
  const providerEarnings = subtractMoney(commissionBase, platformCommission);

  const { error: paymentTxInsertError } = await supabase.from("payment_transactions").insert({
    booking_id: bookingId,
    reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: amountInCurrency - feesInCurrency,
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      payment_type: "booking_remaining",
      customer_email: customer?.email,
    },
    created_at: new Date().toISOString(),
  });
  if (paymentTxInsertError) {
    if (paymentTxInsertError.code === "23505") {
      console.log(`Pay-remaining payment ${reference} was settled concurrently`);
      return;
    }
    throw paymentTxInsertError;
  }

  await supabase.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: payRemainingFinanceTenantId,
    transaction_type: "payment",
    amount: commissionBase,
    fees: feesInCurrency,
    commission: platformCommission,
    net: platformCommission,
    description: `Remaining balance for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });
  await supabase.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: payRemainingFinanceTenantId,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings (remaining balance) for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });

  const payRemainWebhookNow = new Date().toISOString();
  if (walletAmountFromMeta > 0) {
    const { data: existingWalletEntry } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "wallet_payment")
      .ilike("description", `%${reference}%`)
      .maybeSingle();
    if (!existingWalletEntry) {
      await supabase.from("finance_transactions").insert({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: payRemainingFinanceTenantId,
        transaction_type: "wallet_payment",
        amount: walletAmountFromMeta,
        fees: 0,
        commission: 0,
        net: walletAmountFromMeta,
        description: `Wallet (pay-remaining split) ref ${reference} booking ${bookingData.booking_number}`,
        created_at: payRemainWebhookNow,
      });
    }
  }
  if (giftCardAmountFromMeta > 0) {
    const { data: existingGcEntry } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "gift_card_payment")
      .ilike("description", `%${reference}%`)
      .maybeSingle();
    if (!existingGcEntry) {
      await supabase.from("finance_transactions").insert({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: payRemainingFinanceTenantId,
        transaction_type: "gift_card_payment",
        amount: giftCardAmountFromMeta,
        fees: 0,
        commission: 0,
        net: giftCardAmountFromMeta,
        description: `Gift card (pay-remaining split) ref ${reference} booking ${bookingData.booking_number}`,
        created_at: payRemainWebhookNow,
      });
    }
    const { data: existingGcLiab } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "gift_card_liability_reduction")
      .ilike("description", `%${reference}%`)
      .maybeSingle();
    if (!existingGcLiab) {
      await supabase.from("finance_transactions").insert({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: payRemainingFinanceTenantId,
        transaction_type: "gift_card_liability_reduction",
        amount: giftCardAmountFromMeta,
        fees: 0,
        commission: 0,
        net: -giftCardAmountFromMeta,
        description: `Gift card liability reduction (pay-remaining split) ref ${reference} booking ${bookingData.booking_number}`,
        created_at: payRemainWebhookNow,
      });
    }
  }

  await syncBookingAfterPaystackSuccess(supabase, bookingId, {
    paymentReference: reference,
    paymentProvider: "paystack",
  });

  const payRemainRegion = payRemainingFinanceTenantId
    ? await getTenantRegionConfig(payRemainingFinanceTenantId)
    : null;
  const payRemainCurrency =
    (typeof bookingData.currency === "string" && bookingData.currency) ||
    payRemainRegion?.defaultCurrency ||
    LAST_RESORT_CURRENCY;
  const payRemainLocale = getTenantLocaleTagFromRegionConfig(payRemainRegion);
  const payRemainFormatted = new Intl.NumberFormat(payRemainLocale, {
    style: "currency",
    currency: payRemainCurrency,
  }).format(amountInCurrency);

  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      bookingData.customer_id,
      {
        title: "Payment Confirmed",
        message: `Your remaining balance of ${payRemainFormatted} for booking ${bookingData.booking_number} has been paid.`,
        data: { type: "payment_success", booking_id: bookingId },
        url: `/account-settings/bookings`,
      },
      ["push"],
      { appType: "customer" }
    );
    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", providerId)
      .single();
    const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
    if (providerUserId) {
      await sendToUser(
        providerUserId,
        {
          title: "Remaining Balance Paid",
          message: `Remaining balance for booking ${bookingData.booking_number} has been paid.`,
          data: { type: "booking_payment", booking_id: bookingId },
          url: `/provider/bookings/${bookingId}`,
        },
        ["push"],
        { appType: "provider" }
      );
    }
  } catch (notifError) {
    console.error("Error sending pay-remaining notifications:", notifError);
  }
}

// ─── Additional Charges ──────────────────────────────────────────────────────

async function handleAdditionalChargeSuccess(
  payload: { reference: string; metadata: any; amount: any; fees: any; customer: any },
  supabase: SupabaseClient,
) {
  const { reference, metadata, amount, fees, customer } = payload;

  const bookingId = metadata.booking_id as string;
  const chargeId = metadata.additional_charge_id as string;

  const { data: booking, error: additionalBookingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (!booking) {
    // B2: additional-charge success but booking is gone. Throw so Paystack retries.
    const err = new Error(
      `additional-charge.success: booking ${bookingId} not found (reference=${reference}, charge=${chargeId})`
    );
    (err as Error & { cause?: unknown }).cause = additionalBookingError ?? null;
    throw err;
  }
  const bookingData = booking as ChargeBookingRow;
  const providerId = bookingData.provider_id ?? null;

  const additionalChargeFinanceTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: bookingData.tenant_id as string | null | undefined,
    provider_id: bookingData.provider_id as string | null | undefined,
  });

  const { data: charge } = await supabase
    .from("additional_charges")
    .select("*")
    .eq("id", chargeId)
    .eq("booking_id", bookingId)
    .single();

  if (!charge) {
    const err = new Error(
      `additional-charge.success: charge ${chargeId} not found for booking ${bookingId} (reference=${reference})`
    );
    throw err;
  }
  if ((charge as { status?: string }).status === "paid") return;

  const walletAmountFromMeta = Number(metadata?.wallet_amount_applied ?? 0);
  const giftCardAmountFromMeta = Number(metadata?.gift_card_amount_applied ?? 0);
  if (giftCardAmountFromMeta > 0) {
    try {
      await supabase.rpc("capture_gift_card_redemption", { p_booking_id: bookingId });
    } catch (giftCaptureErr) {
      console.error("[additional-charge] gift card capture failed:", giftCaptureErr);
    }
  }
  await completeWalletGiftSyntheticPayments(supabase, bookingId);

  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const chargeAmountMajor = Number((charge as { amount?: number }).amount ?? 0);
  const totalEconomicAmount =
    chargeAmountMajor > 0
      ? chargeAmountMajor
      : amountInCurrency + walletAmountFromMeta + giftCardAmountFromMeta;
  const netAmount = amountInCurrency - feesInCurrency;

  const commissionRate = await resolveCommissionPercentageForProvider(supabase, {
    tenantId: bookingData.tenant_id ?? additionalChargeFinanceTenantId ?? null,
    providerId,
  });
  const platformCommission =
    commissionRate > 0 ? percentOf(totalEconomicAmount, commissionRate) : 0;
  const providerEarnings = subtractMoney(totalEconomicAmount, platformCommission);

  const { error: paymentTxInsertError } = await supabase.from("payment_transactions").insert({
    booking_id: bookingId,
    reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    transaction_type: "additional_charge",
    metadata: {
      additional_charge_id: chargeId,
      customer_email: customer?.email,
    },
    created_at: new Date().toISOString(),
  });
  if (paymentTxInsertError) {
    if (paymentTxInsertError.code === "23505") {
      console.log(`Additional charge payment ${reference} was settled concurrently`);
      return;
    }
    throw paymentTxInsertError;
  }

  await supabase.from("additional_charges")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("id", chargeId)
    .eq("booking_id", bookingId);

  await supabase.from("bookings")
    .update({
      total_amount: Number(bookingData.total_amount ?? 0) + Number((charge as { amount?: number }).amount ?? 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  const addlFinanceNow = new Date().toISOString();
  await supabase.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: additionalChargeFinanceTenantId,
    transaction_type: "additional_charge_payment",
    amount: totalEconomicAmount,
    fees: feesInCurrency,
    commission: platformCommission,
    net: platformCommission,
    description: `Additional charge payment for booking ${bookingData.booking_number}`,
    created_at: addlFinanceNow,
  });

  await supabase.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: additionalChargeFinanceTenantId,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings (additional charge) for booking ${bookingData.booking_number}`,
    created_at: addlFinanceNow,
  });

  if (walletAmountFromMeta > 0) {
    await supabase.from("finance_transactions").insert({
      booking_id: bookingId,
      provider_id: providerId,
      tenant_id: additionalChargeFinanceTenantId,
      transaction_type: "wallet_payment",
      amount: walletAmountFromMeta,
      fees: 0,
      commission: 0,
      net: walletAmountFromMeta,
      description: `Wallet (additional charge split) ref ${reference} charge ${chargeId}`,
      created_at: addlFinanceNow,
    });
  }
  if (giftCardAmountFromMeta > 0) {
    await supabase.from("finance_transactions").insert({
      booking_id: bookingId,
      provider_id: providerId,
      tenant_id: additionalChargeFinanceTenantId,
      transaction_type: "gift_card_payment",
      amount: giftCardAmountFromMeta,
      fees: 0,
      commission: 0,
      net: giftCardAmountFromMeta,
      description: `Gift card (additional charge split) ref ${reference} charge ${chargeId}`,
      created_at: addlFinanceNow,
    });
    await supabase.from("finance_transactions").insert({
      booking_id: bookingId,
      provider_id: providerId,
      tenant_id: additionalChargeFinanceTenantId,
      transaction_type: "gift_card_liability_reduction",
      amount: giftCardAmountFromMeta,
      fees: 0,
      commission: 0,
      net: -giftCardAmountFromMeta,
      description: `Gift card liability reduction (additional charge split) ref ${reference} charge ${chargeId}`,
      created_at: addlFinanceNow,
    });
  }

  await supabase.from("payments")
    .update({
      status: "paid",
      payment_provider: "paystack",
      payment_provider_transaction_id: reference,
      processed_at: new Date().toISOString(),
      payment_provider_response: { ...payload },
    })
    .eq("booking_id", bookingId)
    .eq("payment_provider", "paystack")
    .eq("payment_provider_transaction_id", reference);

  // Create booking_payments row for ledger parity with walk-in mark-paid flow
  try {
    await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      amount: amountInCurrency,
      payment_method: "card",
      payment_provider: "paystack",
      payment_provider_id: reference,
      payment_provider_data: {
        additional_charge_id: chargeId,
        paystack_reference: reference,
        paystack_fees: feesInCurrency,
      },
      status: "completed",
      notes: `Additional charge payment via Paystack (${(charge as { description?: string }).description || "add-on"})`,
      created_by: bookingData.customer_id,
      ...(bookingData.tenant_id ? { tenant_id: bookingData.tenant_id } : {}),
    });
  } catch (bpErr) {
    console.warn("[additional-charge-webhook] booking_payments insert failed:", bpErr);
  }

  await supabase.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "additional_payment_paid",
    event_data: { charge_id: chargeId, reference, amount: amountInCurrency },
    created_by: bookingData.customer_id,
  });

  // In-app notification rows
  try {
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    const bookingRef = bookingData.booking_number || bookingId.slice(0, 8).toUpperCase();
    const notifCurrency = bookingData.currency || "ZAR";
    await insertNotification({
      user_id: bookingData.customer_id,
      type: "additional_charge_paid",
      title: "Additional Payment Confirmed",
      message: `Your additional payment of ${notifCurrency} ${amountInCurrency.toFixed(2)} for booking #${bookingRef} was successful.`,
      data: { booking_id: bookingId, charge_id: chargeId, amount: amountInCurrency },
      action_url: `/account-settings/bookings/${bookingId}`,
    });
    const { data: providerRowForNotif } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", bookingData.provider_id)
      .single();
    const providerUserIdForNotif = (providerRowForNotif as { user_id?: string } | null)?.user_id;
    if (providerUserIdForNotif) {
      await insertNotification({
        user_id: providerUserIdForNotif,
        type: "additional_charge_paid",
        title: "Additional Payment Received",
        message: `Additional payment of ${notifCurrency} ${amountInCurrency.toFixed(2)} received for booking #${bookingRef}.`,
        data: { booking_id: bookingId, charge_id: chargeId, amount: amountInCurrency },
        action_url: `/provider/bookings/${bookingId}`,
      });
    }
  } catch (notifErr) {
    console.warn("[additional-charge-webhook] in-app notification failed:", notifErr);
  }

  // Push notification (customer + provider)
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    const notifyCurrency =
      bookingData.currency ||
      (await lastResortCurrencyFromTenantId(bookingData.tenant_id, {
        supabase,
        providerId: bookingData.provider_id,
      }));
    await sendToUser(
      bookingData.customer_id,
      {
        title: "Additional Payment Confirmed",
        message: `Your additional payment of ${notifyCurrency} ${amountInCurrency.toFixed(2)} was successful.`,
        data: {
          type: "additional_payment_paid",
          booking_id: bookingId,
          charge_id: chargeId,
        },
        url: `/account-settings/bookings/${bookingId}`,
      },
      ["push"],
      { appType: "customer" }
    );

    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", bookingData.provider_id)
      .single();
    const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
    if (providerUserId) {
      await sendToUser(
        providerUserId,
        {
          title: "Additional Payment Received",
          message: `Additional payment received for booking ${bookingData.booking_number}.`,
          data: {
            type: "additional_payment_paid_provider",
            booking_id: bookingId,
            charge_id: chargeId,
          },
          url: `/provider/bookings/${bookingId}`,
        },
        ["push"],
        { appType: "provider" }
      );
    }
  } catch (notifError) {
    console.error("Error sending additional charge success notifications:", notifError);
  }
}

async function handleAdditionalChargeFailed(
  payload: { reference: string; metadata: any; message: any; gateway_response: any },
  supabase: SupabaseClient,
) {
  const { reference, metadata, message, gateway_response } = payload;
  const bookingId = metadata.booking_id as string;
  const chargeId = metadata.additional_charge_id as string;

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (!booking) return;
  const bookingData = booking as ChargeBookingRow;

  await supabase.from("payment_transactions").insert({
    booking_id: bookingId,
    reference,
    amount: 0,
    fees: 0,
    net_amount: 0,
    status: "failed",
    provider: "paystack",
    transaction_type: "additional_charge",
    metadata: {
      additional_charge_id: chargeId,
      failure_reason: message || gateway_response || "paystack_charge_failed",
    },
    created_at: new Date().toISOString(),
  });

  await supabase.from("payments")
    .update({
      status: "failed",
      payment_provider: "paystack",
      payment_provider_transaction_id: reference,
      failed_at: new Date().toISOString(),
      failure_reason: message || gateway_response || "paystack_charge_failed",
      payment_provider_response: { ...payload },
    })
    .eq("booking_id", bookingId)
    .eq("payment_provider", "paystack")
    .eq("payment_provider_transaction_id", reference);

  await supabase.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "additional_payment_failed",
    event_data: { charge_id: chargeId, reference },
    created_by: bookingData.customer_id,
  });

  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      bookingData.customer_id,
      {
        title: "Additional Payment Failed",
        message: `Your additional payment could not be processed. Please try again.`,
        data: {
          type: "additional_payment_failed",
          booking_id: bookingId,
          charge_id: chargeId,
        },
        url: `/account-settings/bookings/${bookingId}`,
      },
      ["push"],
      { appType: "customer" }
    );
  } catch (notifError) {
    console.error("Error sending additional charge failure notification:", notifError);
  }
}
