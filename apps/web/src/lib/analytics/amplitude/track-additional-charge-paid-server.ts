import { trackServer } from "./server";
import { EVENT_ADDITIONAL_CHARGE_PAID } from "./types";

/** Server-authoritative additional charge paid event with insert_id dedup. */
export async function trackAdditionalChargePaidServer(params: {
  reference: string;
  bookingId: string;
  chargeId: string;
  amount: number;
  currency?: string | null;
  customerId?: string | null;
  paymentMethod?: string;
  paymentProvider?: string;
}): Promise<void> {
  const {
    reference,
    bookingId,
    chargeId,
    amount,
    currency,
    customerId,
    paymentMethod = "card",
    paymentProvider = "paystack",
  } = params;

  await trackServer(
    EVENT_ADDITIONAL_CHARGE_PAID,
    {
      portal: "client",
      booking_id: bookingId,
      charge_id: chargeId,
      amount,
      currency: currency ?? undefined,
      payment_method: paymentMethod,
      payment_provider: paymentProvider,
      transaction_id: reference,
    },
    customerId ?? undefined,
    {
      insertId: `${reference}:additional_charge_paid`,
      revenue: amount,
      revenueType: "additional_charge",
      productId: chargeId,
      quantity: 1,
    },
  );
}
