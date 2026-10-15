import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { initializeOnlinePayment } from "@/lib/payments/online-payment";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { paystackChannelsForInitialize } from "@/lib/payments/resolve-paystack-hosted-callback";
import { revalidateBookingSlotBeforePayment } from "@/lib/bookings/revalidate-booking-slot-before-payment";
import type { PublicBookingValidatedBody } from "@/lib/public-booking/booking-draft-schema";
import type { BookingDraft } from "@/types/beautonomi";
import type { ValidatedBookingData } from "./validate-booking";
export type HostedBookingPaymentInitInput = {
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  draft: BookingDraft;
  validatedDraft: PublicBookingValidatedBody;
  v: ValidatedBookingData;
  booking: { id: string; booking_number?: string | null; tenant_id?: string | null };
  flagTenantId: string | null;
  email: string;
  reference: string;
  amountToCollect: number;
  callbackUrl: string;
  bookingCancelAction: string;
  saveCard: boolean;
  setAsDefault: boolean;
  paymentOption: string;
  giftCardAmountApplied: number;
  giftCardCode: string | null;
  walletAmountApplied: number;
  recurringSubscribeEligible: boolean;
  loyaltyPointsRedeemed: number;
};

export type HostedBookingPaymentInitResult = {
  paymentUrl: string | null;
  paymentReference: string;
};

/**
 * Slot revalidation + Paystack/Stripe hosted checkout for a booking that still needs card collection.
 */
export async function initializeHostedBookingPayment(
  input: HostedBookingPaymentInitInput,
): Promise<HostedBookingPaymentInitResult | Response> {
  const {
    supabase,
    supabaseAdmin,
    draft,
    validatedDraft,
    v,
    booking,
    flagTenantId,
    email,
    reference,
    amountToCollect,
    callbackUrl,
    bookingCancelAction,
    saveCard,
    setAsDefault,
    paymentOption,
    giftCardAmountApplied,
    giftCardCode,
    walletAmountApplied,
    recurringSubscribeEligible,
    loyaltyPointsRedeemed,
  } = input;

  const slotOk = await revalidateBookingSlotBeforePayment(supabaseAdmin, booking.id);
  if (slotOk.ok === false) {
    return errorResponse(slotOk.message, slotOk.code, 409);
  }

  let onlineInit: Awaited<ReturnType<typeof initializeOnlinePayment>>;
  try {
    onlineInit = await initializeOnlinePayment({
      tenantId: flagTenantId,
      email,
      amountInSmallestUnit: convertToSmallestUnit(amountToCollect, v.currency),
      currency: v.currency,
      reference,
      callbackUrl,
      lineItemName: `Booking ${booking.booking_number || booking.id}`,
      saveCard,
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
        loyalty_discount_amount:
          v.loyaltyDiscountAmount > 0 ? v.loyaltyDiscountAmount : undefined,
        cancel_action: bookingCancelAction,
        ...(recurringSubscribeEligible
          ? { subscribe_recurring_frequency: validatedDraft.subscribe_recurring!.frequency }
          : {}),
      },
      ...(() => {
        const ch = paystackChannelsForInitialize({ saveCard });
        return ch.channels ? { channels: ch.channels } : {};
      })(),
    });
  } catch (initErr) {
    console.error("[initialize-hosted-booking-payment] initializeOnlinePayment threw:", initErr);
    return handleApiError(
      initErr,
      "Payment provider is temporarily unavailable. Please try again in a moment.",
      "PAYMENT_INIT_FAILED",
      502,
    );
  }

  await (supabaseAdmin.from("bookings") as any)
    .update({
      payment_reference: reference,
      payment_provider: onlineInit.provider,
      payment_status: "pending",
      status: "pending_payment",
    })
    .eq("id", booking.id)
    .eq("customer_id", v.customerId);

  await (supabase.from("payments") as any).insert({
    booking_id: booking.id,
    user_id: v.customerId,
    provider_id: draft.provider_id,
    payment_number: "",
    amount: amountToCollect,
    currency: v.currency,
    status: "pending",
    payment_provider: onlineInit.provider,
    payment_provider_transaction_id: reference,
    payment_provider_response: onlineInit,
    description: `Payment for booking ${booking.booking_number}`,
    metadata: {
      payment_option: v.provider.requires_deposit ? paymentOption : "full",
      gift_card_amount_applied: giftCardAmountApplied,
      gift_card_code: giftCardCode || null,
      wallet_amount_applied: walletAmountApplied,
      save_card: saveCard,
    },
  });

  return {
    paymentUrl: onlineInit.authorizationUrl || null,
    paymentReference: reference,
  };
}
