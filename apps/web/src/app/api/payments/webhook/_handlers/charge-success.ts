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
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_PAYMENT_SUCCESS, EVENT_PAYMENT_FAILED } from "@/lib/analytics/amplitude/types";
import type { PaystackEvent, SupabaseClient } from "./shared";
import { savePaystackAuthorization, generateGiftCardCode } from "./shared";

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

async function processSuccessfulPayment(data: any, supabase: SupabaseClient) {
  const { reference, metadata, amount, fees, customer, authorization } = data;

  if (!reference || !metadata?.booking_id) {
    // Non-booking flows (gift cards, subscriptions, etc.)
    if (metadata?.custom_offer_id) {
      await handleCustomOfferSuccess({ reference, metadata, amount, fees, customer }, supabase);
      return;
    }
    if (metadata?.wallet_topup_id) {
      await handleWalletTopupSuccess({ reference, metadata, amount }, supabase);
      return;
    }
    if (metadata?.gift_card_order_id) {
      await handleGiftCardOrderSuccess({ reference, metadata, amount }, supabase);
      return;
    }
    if (metadata?.membership_order_id) {
      await handleMembershipOrderSuccess({ reference, metadata }, supabase);
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
    console.error("Missing reference or booking_id in payment data");
    return;
  }

  // Additional charge payment flow
  if (metadata?.additional_charge_id) {
    await handleAdditionalChargeSuccess({ reference, metadata, amount, fees, customer }, supabase);
    return;
  }

  // ── Standard booking payment ──────────────────────────────────────────────

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", metadata.booking_id)
    .single();

  if (bookingError || !booking) {
    console.error("Booking not found:", metadata.booking_id);
    return;
  }

  const bookingData = booking as any;

  // Check if already processed
  if (bookingData.payment_status === "paid" && bookingData.payment_reference === reference) {
    console.log(`Payment ${reference} already processed`);
    return;
  }

  // Calculate amounts (Paystack amounts are in smallest currency unit)
  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  // Tip/Tax/Travel fees/Service fee are excluded from commission
  const tipAmount = Number(metadata?.tip_amount ?? bookingData.tip_amount ?? 0);
  const taxAmount = Number(metadata?.tax_amount ?? bookingData.tax_amount ?? 0);
  const travelFee = Number(metadata?.travel_fee ?? bookingData.travel_fee ?? 0);
  const serviceFeeAmount = Number(
    metadata?.service_fee_amount ??
      bookingData.service_fee_amount ??
      bookingData.platform_service_fee ??
      0,
  );
  const commissionBase = Number(
    metadata?.commission_base ??
      Number(bookingData.total_amount || 0) - tipAmount - taxAmount - travelFee - serviceFeeAmount,
  );

  // Get platform commission settings
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
    commissionEnabled && commissionRate > 0 ? (commissionBase * commissionRate) / 100 : 0;

  const providerEarnings = commissionBase - platformCommission + travelFee + tipAmount;

  // Update booking payment status
  const { error: updateError } = await (supabase.from("bookings") as any)
    .update({
      payment_status: "paid",
      payment_reference: reference,
      payment_date: new Date().toISOString(),
      payment_provider: "paystack",
      status: "confirmed",
    })
    .eq("id", metadata.booking_id);

  if (updateError) {
    console.error("Error updating booking payment status:", updateError);
    throw updateError;
  }

  // Gift cards: capture reserved redemption
  try {
    const captureResult = await (supabase.rpc as any)("capture_gift_card_redemption", {
      p_booking_id: metadata.booking_id,
    });

    if (captureResult === false || captureResult === null) {
      console.warn(
        `Gift card redemption capture failed for booking ${metadata.booking_id}. Check if gift card expired.`,
      );
    }
  } catch (gcError: any) {
    const errorMessage = gcError?.message || String(gcError);

    if (errorMessage.includes("expired") || errorMessage.includes("no longer active")) {
      console.warn(
        `Gift card expired for booking ${metadata.booking_id}. Redemption voided:`,
        errorMessage,
      );

      await (supabase.from("bookings") as any)
        .update({
          gift_card_id: null,
          gift_card_amount: 0,
        })
        .eq("id", metadata.booking_id);
    } else {
      console.error("Error capturing gift card redemption:", gcError);
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

  // Create payment transaction record
  await (supabase.from("payment_transactions") as any).insert({
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
    created_at: new Date().toISOString(),
  });

  // Update primary payments table
  await (supabase.from("payments") as any)
    .update({
      status: "paid",
      payment_provider: "paystack",
      payment_provider_transaction_id: reference,
      processed_at: new Date().toISOString(),
      payment_provider_response: data,
    })
    .eq("booking_id", metadata.booking_id)
    .eq("payment_provider", "paystack");

  // Create finance ledger entries — platform fee
  await (supabase.from("finance_transactions") as any).insert({
    booking_id: metadata.booking_id,
    provider_id: bookingData.provider_id || null,
    transaction_type: "payment",
    amount: commissionBase,
    fees: feesInCurrency,
    commission: platformCommission,
    net: platformCommission,
    description: `Payment for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });

  // Provider earnings entry
  await (supabase.from("finance_transactions") as any).insert({
    booking_id: metadata.booking_id,
    provider_id: bookingData.provider_id || null,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });

  // Platform service fee entry
  if (serviceFeeAmount > 0) {
    await (supabase.from("finance_transactions") as any).insert({
      booking_id: metadata.booking_id,
      provider_id: bookingData.provider_id || null,
      transaction_type: "service_fee",
      amount: serviceFeeAmount,
      fees: 0,
      commission: 0,
      net: serviceFeeAmount,
      description: `Service fee for booking ${bookingData.booking_number}`,
      created_at: new Date().toISOString(),
    });
  }

  // Tip / Tax / Travel fee reporting rows
  await (supabase.from("finance_transactions") as any).insert([
    {
      booking_id: metadata.booking_id,
      provider_id: bookingData.provider_id || null,
      transaction_type: "tip",
      amount: tipAmount,
      fees: 0,
      commission: 0,
      net: 0,
      description: `Tip for booking ${bookingData.booking_number}`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: metadata.booking_id,
      provider_id: bookingData.provider_id || null,
      transaction_type: "tax",
      amount: taxAmount,
      fees: 0,
      commission: 0,
      net: 0,
      description: `Tax for booking ${bookingData.booking_number}`,
      created_at: new Date().toISOString(),
    },
    ...(travelFee > 0
      ? [
          {
            booking_id: metadata.booking_id,
            provider_id: bookingData.provider_id || null,
            transaction_type: "travel_fee",
            amount: travelFee,
            fees: 0,
            commission: 0,
            net: 0,
            description: `Travel fee for booking ${bookingData.booking_number}`,
            created_at: new Date().toISOString(),
          },
        ]
      : []),
  ]);

  // Promotions: record usage (idempotent)
  try {
    const promoId = bookingData.promotion_id;
    const promoDiscount = Number(bookingData.promotion_discount_amount || 0);
    if (promoId && promoDiscount > 0) {
      const { data: usageRow, error: usageError } = await (
        supabase.from("promotion_usage") as any
      )
        .insert({
          promotion_id: promoId,
          user_id: bookingData.customer_id,
          booking_id: metadata.booking_id,
          discount_amount: promoDiscount,
          used_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!usageError && usageRow?.id) {
        const { data: promoRow } = await (supabase.from("promotions") as any)
          .select("usage_count")
          .eq("id", promoId)
          .single();
        const nextCount = Number(promoRow?.usage_count || 0) + 1;
        await (supabase.from("promotions") as any)
          .update({ usage_count: nextCount })
          .eq("id", promoId);
      }
    }
  } catch (promoError) {
    const msg = promoError instanceof Error ? promoError.message : String(promoError);
    if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
      console.error("Error recording promotion usage:", promoError);
    }
  }

  // Send OneSignal notifications
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");

    await sendToUser(bookingData.customer_id, {
      title: "Payment Confirmed",
      message: `Your payment for booking ${bookingData.booking_number} has been confirmed.`,
      data: {
        type: "payment_success",
        booking_id: metadata.booking_id,
      },
      url: `/account-settings/bookings`,
    });

    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", bookingData.provider_id)
      .single();

    const providerUserId = (providerRow as any)?.user_id;
    if (providerUserId) {
      await sendToUser(providerUserId, {
        title: "New Booking Payment",
        message: `Payment received for booking ${bookingData.booking_number}.`,
        data: {
          type: "booking_payment",
          booking_id: metadata.booking_id,
        },
        url: `/provider/bookings/${metadata.booking_id}`,
      });
    }
  } catch (notifError) {
    console.error("Error sending notifications:", notifError);
  }

  // Track Amplitude event
  try {
    await trackServer(
      EVENT_PAYMENT_SUCCESS,
      {
        portal: "client",
        booking_id: metadata.booking_id,
        amount: amountInCurrency,
        currency: metadata?.currency || bookingData.currency || "ZAR",
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

async function processFailedPayment(data: any, supabase: SupabaseClient) {
  const { reference, metadata, message, gateway_response } = data;

  if (!reference || !metadata?.booking_id) {
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

  // ── Standard booking failure ──────────────────────────────────────────────

  const { data: booking } = await supabase
    .from("bookings")
    .select("customer_id, booking_number")
    .eq("id", metadata.booking_id)
    .single();

  if (!booking) {
    console.error("Booking not found:", metadata.booking_id);
    return;
  }

  const bookingData = booking as any;

  // If wallet was used as partial payment, refund it immediately
  const walletAmountApplied = Number(metadata?.wallet_amount_applied ?? 0);
  if (walletAmountApplied > 0) {
    try {
      await (supabase.rpc as any)("wallet_credit_admin", {
        p_user_id: bookingData.customer_id,
        p_amount: walletAmountApplied,
        p_currency: metadata?.currency || "ZAR",
        p_description: `Wallet refund (payment failed) for booking ${bookingData.booking_number}`,
        p_reference_id: metadata.booking_id,
        p_reference_type: "booking_payment_failed",
      });

      await (supabase.from("bookings") as any)
        .update({ wallet_amount: 0 })
        .eq("id", metadata.booking_id);
    } catch (e) {
      console.error("Failed to refund wallet on charge.failed:", e);
    }
  }

  // Update booking payment status
  const { error: updateError } = await (supabase.from("bookings") as any)
    .update({
      payment_status: "failed",
      payment_reference: reference,
      payment_provider: "paystack",
    })
    .eq("id", metadata.booking_id);

  if (updateError) {
    console.error("Error updating booking payment status:", updateError);
    throw updateError;
  }

  // Gift cards: void reserved redemption and restore balance
  try {
    await (supabase.rpc as any)("void_gift_card_redemption", {
      p_booking_id: metadata.booking_id,
    });
  } catch (gcError) {
    console.error("Error voiding gift card redemption:", gcError);
  }

  // Create payment transaction record
  await (supabase.from("payment_transactions") as any).insert({
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

  await (supabase.from("payments") as any)
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

    await sendToUser(bookingData.customer_id, {
      title: "Payment Failed",
      message: `Your payment for booking ${bookingData.booking_number} could not be processed. Please try again.`,
      data: {
        type: "payment_failed",
        booking_id: metadata.booking_id,
      },
      url: `/checkout`,
    });
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
        currency: metadata?.currency || "ZAR",
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

async function handleCustomOfferSuccess(
  payload: { reference: string; metadata: any; amount?: number; fees?: number; customer?: any },
  supabase: SupabaseClient,
) {
  const offerId = payload.metadata.custom_offer_id as string;
  if (!offerId) return;

  // Use admin client to bypass RLS (required for booking creation)
  const adminSupabase = getSupabaseAdmin();

  const { data: offerRow } = await adminSupabase
    .from("custom_offers")
    .select("*, request:custom_requests(*)")
    .eq("id", offerId)
    .single();
  if (!offerRow) return;
  const offer = offerRow as any;
  const req = offer.request as any;

  // Idempotency: if booking already created, just ensure status is paid
  if (offer.status === "paid" && offer.booking_id) return;

  const amountInCurrency = convertFromSmallestUnit(payload.amount || 0);
  const feesInCurrency = convertFromSmallestUnit(payload.fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  // Create a hidden offering to satisfy booking_services.offering_id
  const offeringTitle = `Custom Service`;
  const { data: createdOffering, error: offeringError } = await adminSupabase
    .from("offerings")
    .insert({
      provider_id: req.provider_id,
      master_service_id: null,
      title: offeringTitle,
      description: req.description,
      category_id: req.service_category_id || null,
      subcategory_id: null,
      duration_minutes: offer.duration_minutes,
      buffer_minutes: 0,
      price: offer.price,
      currency: offer.currency || "ZAR",
      supports_at_home: req.location_type === "at_home",
      supports_at_salon: req.location_type === "at_salon",
      is_active: false,
      display_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (offeringError || !createdOffering) {
    console.error("Failed to create offering for custom offer:", offeringError);
    return;
  }

  // Create booking
  const scheduledAt = req.preferred_start_at
    ? new Date(req.preferred_start_at).toISOString()
    : new Date().toISOString();
  const bookingSubtotal = Number(offer.price || 0);
  const bookingTotal = bookingSubtotal;

  const bookingInsert: any = {
    booking_number: "",
    customer_id: req.customer_id,
    provider_id: req.provider_id,
    status: "confirmed",
    location_type: req.location_type || "at_salon",
    location_id: null,
    scheduled_at: scheduledAt,
    subtotal: bookingSubtotal,
    tip_amount: 0,
    discount_amount: 0,
    total_amount: bookingTotal,
    currency: offer.currency || "ZAR",
    payment_status: "paid",
    payment_reference: payload.reference,
    payment_date: new Date().toISOString(),
    payment_provider: "paystack",
    special_requests: `Custom order: ${req.description}`,
    loyalty_points_earned: 0,
    loyalty_points_used: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: booking, error: bookingError } = await adminSupabase
    .from("bookings")
    .insert(bookingInsert)
    .select()
    .single();

  if (bookingError || !booking) {
    console.error("Failed to create booking for custom offer:", bookingError);
    return;
  }

  // Booking service row
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + Number(offer.duration_minutes || 60) * 60 * 1000);
  const assignedStaffId = offer.staff_id || null;

  const { error: bookingServiceError } = await adminSupabase
    .from("booking_services")
    .insert({
      booking_id: booking.id,
      offering_id: createdOffering.id,
      staff_id: assignedStaffId,
      duration_minutes: Number(offer.duration_minutes || 60),
      price: bookingSubtotal,
      currency: offer.currency || "ZAR",
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (bookingServiceError) {
    console.error("Failed to create booking service for custom offer:", bookingServiceError);
  }

  // Update custom offer status and link booking
  await adminSupabase
    .from("custom_offers")
    .update({
      status: "paid",
      booking_id: booking.id,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  // Commission + ledger entries
  const { data: settingsRow } = await adminSupabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commissionRate =
    (settingsRow as any)?.settings?.payouts?.platform_commission_percentage ?? 15;
  const commissionBase = bookingSubtotal;
  const platformCommission = (commissionBase * commissionRate) / 100;
  const providerEarnings = commissionBase - platformCommission;

  await adminSupabase.from("payment_transactions").insert({
    booking_id: booking.id,
    reference: payload.reference,
    amount: amountInCurrency,
    fees: feesInCurrency,
    net_amount: netAmount,
    status: "success",
    provider: "paystack",
    metadata: { custom_offer_id: offerId, customer_email: payload.customer?.email },
    created_at: new Date().toISOString(),
  });

  await adminSupabase.from("finance_transactions").insert([
    {
      booking_id: booking.id,
      provider_id: req.provider_id,
      transaction_type: "payment",
      amount: commissionBase,
      fees: feesInCurrency,
      commission: platformCommission,
      net: platformCommission,
      description: `Custom order payment`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: booking.id,
      provider_id: req.provider_id,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings (custom order)`,
      created_at: new Date().toISOString(),
    },
  ]);

  // Update custom request status to fulfilled
  await adminSupabase
    .from("custom_requests")
    .update({ status: "fulfilled", updated_at: new Date().toISOString() })
    .eq("id", req.id);

  // Post a "paid + booking created" message into conversation (best-effort)
  try {
    if (booking) {
      const { data: providerRow } = await adminSupabase
        .from("providers")
        .select("user_id")
        .eq("id", req.provider_id)
        .single();
      const providerUserId = (providerRow as any)?.user_id as string | undefined;

      const { data: conv } = await adminSupabase
        .from("conversations")
        .select("id, booking_id")
        .eq("customer_id", req.customer_id)
        .eq("provider_id", req.provider_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const convId = (conv as any)?.id as string | undefined;
      if (convId) {
        if (!(conv as any)?.booking_id) {
          await adminSupabase
            .from("conversations")
            .update({ booking_id: booking.id, updated_at: new Date().toISOString() })
            .eq("id", convId);
        }

        if (providerUserId) {
          await adminSupabase.from("messages").insert({
            conversation_id: convId,
            sender_id: providerUserId,
            sender_role: "provider_owner",
            content: `Payment received — booking created${booking.booking_number ? ` (#${booking.booking_number})` : ""}.`,
            attachments: [
              {
                type: "custom_offer_paid",
                offer_id: offerId,
                booking_id: booking.id,
                booking_number: booking.booking_number || null,
              },
            ],
            is_read: false,
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  } catch {
    // ignore messaging failures
  }

  // Notify both parties (best-effort)
  try {
    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", req.provider_id)
      .single();
    const providerUserId = (providerRow as any)?.user_id;
    const recipients = [req.customer_id, providerUserId].filter(Boolean);
    if (recipients.length > 0) {
      await sendToUsers(recipients, {
        title: "Custom Order Paid",
        message: "Your custom order has been paid and a booking has been created.",
        data: {
          type: "custom_order_paid",
          custom_offer_id: offerId,
          booking_id: (booking as any)?.id,
        },
        url: "/account-settings/bookings",
      });
    }
  } catch {
    // ignore
  }
}

async function handleCustomOfferFailed(
  payload: { reference: string; metadata: any; message?: string; gateway_response?: string },
  supabase: SupabaseClient,
) {
  const offerId = payload.metadata.custom_offer_id as string;
  if (!offerId) return;

  await (supabase.from("custom_offers") as any)
    .update({
      status: "pending",
      payment_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);
}

// ─── Wallet Top-up ───────────────────────────────────────────────────────────

async function handleWalletTopupSuccess(
  payload: { reference: string; metadata: any; amount: any },
  supabase: SupabaseClient,
) {
  const topupId = payload.metadata.wallet_topup_id as string;
  if (!topupId) return;

  const { data: topup } = await (supabase.from("wallet_topups") as any)
    .select("*")
    .eq("id", topupId)
    .single();
  if (!topup) return;

  if ((topup as any).status === "paid") return;

  const amountInCurrency = convertFromSmallestUnit(payload.amount || 0);
  const currency = (topup as any).currency || "ZAR";

  await (supabase.rpc as any)("wallet_credit_admin", {
    p_user_id: (topup as any).user_id,
    p_amount: amountInCurrency,
    p_currency: currency,
    p_description: `Wallet top up (${currency} ${amountInCurrency})`,
    p_reference_id: topupId,
    p_reference_type: "wallet_topup",
  });

  await (supabase.from("wallet_topups") as any)
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paystack_reference: payload.reference,
      updated_at: new Date().toISOString(),
    })
    .eq("id", topupId);
}

async function handleWalletTopupFailed(
  payload: { reference: string; metadata: any; message?: string; gateway_response?: string },
  supabase: SupabaseClient,
) {
  const topupId = payload.metadata.wallet_topup_id as string;
  if (!topupId) return;

  await (supabase.from("wallet_topups") as any)
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

  const { data: order } = await (supabase.from("gift_card_orders") as any)
    .select("*")
    .eq("id", orderId)
    .single();
  if (!order) return;

  if ((order as any).status === "paid" && (order as any).gift_card_id) return;

  const orderData = order as any;
  const currency = orderData.currency || "ZAR";
  const value = Number(orderData.amount || 0);
  const quantity = Number(orderData.quantity || metadata.quantity || 1);
  const totalAmount = Number(orderData.total_amount || value * quantity);

  const giftCardIds: string[] = [];
  const giftCardCodes: string[] = [];

  for (let i = 0; i < quantity; i++) {
    let code = generateGiftCardCode();
    for (let j = 0; j < 5; j++) {
      const { data: existing } = await (supabase.from("gift_cards") as any)
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateGiftCardCode();
    }

    const { data: card, error: cardError } = await (supabase.from("gift_cards") as any)
      .insert({
        code,
        currency,
        initial_balance: value,
        balance: value,
        is_active: true,
        metadata: {
          source: "purchase",
          order_id: orderId,
          purchaser_user_id: orderData.purchaser_user_id,
          recipient_email: orderData.recipient_email,
          paystack_reference: reference,
          bulk_order_index: quantity > 1 ? i + 1 : null,
          bulk_order_total: quantity > 1 ? quantity : null,
        },
      })
      .select("*")
      .single();

    if (cardError || !card) {
      console.error(`Failed to issue gift card ${i + 1} of ${quantity}:`, cardError);
      continue;
    }

    giftCardIds.push((card as any).id);
    giftCardCodes.push(code);
  }

  if (giftCardIds.length === 0) {
    throw new Error("Failed to issue any gift cards");
  }

  await (supabase.from("gift_card_orders") as any)
    .update({
      status: "paid",
      gift_card_id: giftCardIds[0],
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await (supabase.from("payment_transactions") as any).insert({
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
      gift_card_ids: giftCardIds,
      quantity: quantity,
    },
    created_at: new Date().toISOString(),
  });

  await (supabase.from("finance_transactions") as any).insert({
    booking_id: null,
    provider_id: null,
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

      await sendToUser(orderData.purchaser_user_id, {
        title: quantity === 1 ? "Gift Card Purchased" : `${quantity} Gift Cards Purchased`,
        message: notifMessage,
        data: {
          type: "gift_card_issued",
          gift_card_ids: giftCardIds,
          codes: giftCardCodes,
          quantity: quantity,
        },
        url: `/account-settings/payments`,
      });
    }
  } catch (e) {
    console.error("Error notifying gift card purchaser:", e);
  }
}

async function handleGiftCardOrderFailed(
  payload: { reference: string; metadata: any; message: any },
  supabase: SupabaseClient,
) {
  const orderId = payload.metadata.gift_card_order_id as string;
  await (supabase.from("gift_card_orders") as any)
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

// ─── Membership Order ────────────────────────────────────────────────────────

async function handleMembershipOrderSuccess(
  payload: { reference: string; metadata: any },
  supabase: SupabaseClient,
) {
  const { metadata } = payload;
  const orderId = metadata.membership_order_id as string;

  const { data: order } = await (supabase.from("membership_orders") as any)
    .select("*")
    .eq("id", orderId)
    .single();
  if (!order) return;
  if ((order as any).status === "paid") return;

  const orderData = order as any;
  const providerId = orderData.provider_id || null;

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  await (supabase.from("user_memberships") as any).upsert(
    {
      user_id: orderData.user_id,
      provider_id: orderData.provider_id,
      plan_id: orderData.plan_id,
      status: "active",
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      metadata: { source: "purchase", membership_order_id: orderId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider_id" },
  );

  await (supabase.from("membership_orders") as any)
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", orderId);

  await (supabase.from("payment_transactions") as any).insert({
    booking_id: null,
    reference: payload.reference,
    amount: Number(orderData.amount || 0),
    fees: 0,
    net_amount: Number(orderData.amount || 0),
    status: "success",
    provider: "paystack",
    transaction_type: "charge",
    metadata: {
      kind: "membership_order",
      membership_order_id: orderId,
      plan_id: orderData.plan_id,
      provider_id: orderData.provider_id,
    },
    created_at: new Date().toISOString(),
  });

  await (supabase.from("finance_transactions") as any).insert({
    booking_id: null,
    provider_id: providerId,
    transaction_type: "membership_sale",
    amount: Number(orderData.amount || 0),
    fees: 0,
    commission: 0,
    net: 0,
    description: `Membership sale (gross)`,
    created_at: new Date().toISOString(),
  });

  if (providerId) {
    await (supabase.from("finance_transactions") as any).insert({
      booking_id: null,
      provider_id: providerId,
      transaction_type: "provider_earnings",
      amount: Number(orderData.amount || 0),
      fees: 0,
      commission: 0,
      net: Number(orderData.amount || 0),
      description: `Provider earnings from membership sale`,
      created_at: new Date().toISOString(),
    });
  }

  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(orderData.user_id, {
      title: "Membership Activated",
      message: "Your membership has been activated.",
      data: {
        type: "membership_activated",
        provider_id: orderData.provider_id,
        plan_id: orderData.plan_id,
      },
      url: `/account-settings`,
    });
  } catch (e) {
    console.error("Membership activation notification failed:", e);
  }
}

async function handleMembershipOrderFailed(
  payload: { reference: string; metadata: any; message: any },
  supabase: SupabaseClient,
) {
  const orderId = payload.metadata.membership_order_id as string;
  await (supabase.from("membership_orders") as any)
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

  const { data: order } = await (supabase.from("provider_subscription_orders") as any)
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) return;
  if ((order as any).status === "paid") return;

  const orderData = order as any;
  const providerId = orderData.provider_id as string;
  const planId = orderData.plan_id as string;
  const billingPeriod = (orderData.billing_period || "monthly") as "monthly" | "yearly";

  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  await (supabase.from("provider_subscription_orders") as any)
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

  await (supabase.from("provider_subscriptions") as any).upsert(
    {
      provider_id: providerId,
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

  await (supabase.from("payment_transactions") as any).insert({
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

  await (supabase.from("finance_transactions") as any).insert([
    {
      booking_id: null,
      provider_id: providerId,
      transaction_type: "provider_subscription_payment",
      amount: netAmount,
      fees: feesInCurrency,
      commission: 0,
      net: netAmount,
      description: `Provider subscription payment`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: null,
      provider_id: providerId,
      transaction_type: "provider_expense",
      amount: amountInCurrency,
      fees: 0,
      commission: 0,
      net: -amountInCurrency,
      description: `Provider subscription fee`,
      created_at: new Date().toISOString(),
    },
  ]);
}

async function handleProviderSubscriptionOrderFailed(
  payload: { reference: string; metadata: any; message: any },
  supabase: SupabaseClient,
) {
  const orderId = payload.metadata.provider_subscription_order_id as string;
  await (supabase.from("provider_subscription_orders") as any)
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", orderId);
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

  await (supabase.from("provider_subscription_orders") as any)
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
    await (supabase.from("provider_subscriptions") as any)
      .update({
        paystack_authorization_code: authCode,
        paystack_customer_code: customerCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existingSub as any).id);
  } else {
    await (supabase.from("provider_subscriptions") as any).insert({
      provider_id: providerId,
      plan_id: planId,
      status: "pending",
      billing_period: billingPeriod,
      auto_renew: false,
      paystack_authorization_code: authCode,
      paystack_customer_code: customerCode,
      updated_at: new Date().toISOString(),
    });
  }

  await (supabase.from("payment_transactions") as any).insert({
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

      await (supabase.from("provider_subscriptions") as any)
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
    }
  } catch (err: any) {
    console.error("Failed to create Paystack subscription after authorization:", err);
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

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (!booking) return;
  const bookingData = booking as any;
  const providerId = bookingData.provider_id || null;

  const { data: charge } = await (supabase.from("additional_charges") as any)
    .select("*")
    .eq("id", chargeId)
    .eq("booking_id", bookingId)
    .single();

  if (!charge) return;
  if ((charge as any).status === "paid") return;

  const amountInCurrency = convertFromSmallestUnit(amount || 0);
  const feesInCurrency = convertFromSmallestUnit(fees || 0);
  const netAmount = amountInCurrency - feesInCurrency;

  // Commission
  const { data: settingsRow } = await (supabase.from("platform_settings") as any)
    .select("settings")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commissionRate =
    (settingsRow as any)?.settings?.payouts?.platform_commission_percentage ?? 15;
  const platformCommission = (netAmount * commissionRate) / 100;
  const providerEarnings = netAmount - platformCommission;

  await (supabase.from("additional_charges") as any)
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("id", chargeId)
    .eq("booking_id", bookingId);

  await (supabase.from("bookings") as any)
    .update({
      total_amount: Number(bookingData.total_amount || 0) + Number((charge as any).amount || 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  await (supabase.from("payment_transactions") as any).insert({
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

  await (supabase.from("finance_transactions") as any).insert({
    booking_id: bookingId,
    provider_id: providerId,
    transaction_type: "additional_charge_payment",
    amount: netAmount,
    fees: feesInCurrency,
    commission: platformCommission,
    net: platformCommission,
    description: `Additional charge payment for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });

  await (supabase.from("finance_transactions") as any).insert({
    booking_id: bookingId,
    provider_id: providerId,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings (additional charge) for booking ${bookingData.booking_number}`,
    created_at: new Date().toISOString(),
  });

  await (supabase.from("payments") as any)
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

  await (supabase.from("booking_events") as any).insert({
    booking_id: bookingId,
    event_type: "additional_payment_paid",
    event_data: { charge_id: chargeId, reference, amount: amountInCurrency },
    created_by: bookingData.customer_id,
  });

  // Notify customer + provider
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(bookingData.customer_id, {
      title: "Additional Payment Confirmed",
      message: `Your additional payment of ${bookingData.currency || "ZAR"} ${amountInCurrency.toFixed(2)} was successful.`,
      data: {
        type: "additional_payment_paid",
        booking_id: bookingId,
        charge_id: chargeId,
      },
      url: `/account-settings/bookings/${bookingId}`,
    });

    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", bookingData.provider_id)
      .single();
    const providerUserId = (providerRow as any)?.user_id;
    if (providerUserId) {
      await sendToUser(providerUserId, {
        title: "Additional Payment Received",
        message: `Additional payment received for booking ${bookingData.booking_number}.`,
        data: {
          type: "additional_payment_paid_provider",
          booking_id: bookingId,
          charge_id: chargeId,
        },
        url: `/provider/bookings/${bookingId}`,
      });
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
  const bookingData = booking as any;

  await (supabase.from("payment_transactions") as any).insert({
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

  await (supabase.from("payments") as any)
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

  await (supabase.from("booking_events") as any).insert({
    booking_id: bookingId,
    event_type: "additional_payment_failed",
    event_data: { charge_id: chargeId, reference },
    created_by: bookingData.customer_id,
  });

  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(bookingData.customer_id, {
      title: "Additional Payment Failed",
      message: `Your additional payment could not be processed. Please try again.`,
      data: {
        type: "additional_payment_failed",
        booking_id: bookingId,
        charge_id: chargeId,
      },
      url: `/account-settings/bookings/${bookingId}`,
    });
  } catch (notifError) {
    console.error("Error sending additional charge failure notification:", notifError);
  }
}
