import { trackServer } from "./server";
import { EVENT_PAYMENT_FAILED, EVENT_PAYMENT_SUCCESS } from "./types";
import { buildMoneyEventInsertId, trackMoneyEventServer } from "./track-money-event-server";

/**
 * Booking payment succeeded (base booking charge). Call from the booking settlement helper so the
 * saved-card, wallet and Paystack webhook paths share one emission point.
 */
export async function trackPaymentSuccessServer(params: {
  reference: string;
  bookingId: string;
  amount: number;
  currency?: string | null;
  customerId?: string | null;
  providerId?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
  paymentType?: "full" | "deposit" | "remaining" | string | null;
}): Promise<void> {
  await trackMoneyEventServer(EVENT_PAYMENT_SUCCESS, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.customerId,
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "booking",
    productId: params.bookingId,
    properties: {
      booking_id: params.bookingId,
      provider_id: params.providerId ?? undefined,
      payment_type: params.paymentType ?? undefined,
    },
  });
}

/** Booking payment failed / declined. No revenue; still deduped on reference. */
export async function trackPaymentFailedServer(params: {
  reference: string;
  bookingId?: string | null;
  customerId?: string | null;
  error?: string | null;
  paymentProvider?: string | null;
}): Promise<void> {
  if (!params.reference) return;
  try {
    await trackServer(
      EVENT_PAYMENT_FAILED,
      {
        portal: "client",
        booking_id: params.bookingId ?? undefined,
        transaction_id: params.reference,
        payment_provider: params.paymentProvider ?? "paystack",
        error: params.error ? String(params.error).slice(0, 200) : undefined,
      },
      params.customerId ?? undefined,
      { insertId: buildMoneyEventInsertId(params.reference, EVENT_PAYMENT_FAILED) },
    );
  } catch {
    /* never throw from analytics */
  }
}
