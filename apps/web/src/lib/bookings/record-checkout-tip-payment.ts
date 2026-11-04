import type { SupabaseClient } from "@supabase/supabase-js";
import { incrementBookingTipAmount } from "@/lib/bookings/increment-booking-tip";

/**
 * Record a till tip as its own payment.
 * The ledger trigger posts payment_provider_data.tip and returns, so the tip is
 * not also carved out of a balance payment that only covers part of the booking.
 */
export async function recordCheckoutTipPayment(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    tenantId: string | null;
    tip: number;
    paymentMethod: string;
    paymentProvider: string;
    processedBy?: string | null;
    providerPaymentId: string;
  },
): Promise<void> {
  const tip = Math.round(Math.max(0, params.tip) * 100) / 100;
  if (tip <= 0) return;

  const { error } = await supabase.from("booking_payments").insert({
    booking_id: params.bookingId,
    tenant_id: params.tenantId,
    amount: tip,
    payment_method: params.paymentMethod,
    payment_provider: params.paymentProvider,
    payment_provider_id: params.providerPaymentId,
    payment_provider_data: {
      tip: true,
      source: "checkout_tip",
    },
    status: "completed",
    notes: `Checkout tip - ${params.providerPaymentId}`,
    created_by: params.processedBy ?? null,
  });
  if (error) {
    if (error.code === "23505") return;
    throw error;
  }

  await incrementBookingTipAmount(supabase, params.bookingId, tip);
}
