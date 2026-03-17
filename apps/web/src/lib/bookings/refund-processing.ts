/**
 * Refund Processing Logic
 * Handles refunds for cancelled bookings based on cancellation policy.
 * Refunds always credit the customer's wallet (platform policy).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CancellationPolicy } from "./cancellation-policy";

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  error?: string;
}

/**
 * Process refund for a cancelled booking.
 * Credits the customer's wallet and creates a booking_refund record (store_credit).
 */
export async function processBookingRefund(
  bookingId: string,
  bookingTotal: number,
  currency: string,
  policy: CancellationPolicy,
  _paymentReference?: string
): Promise<RefundResult> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    let refundAmount = 0;

    if (policy.late_cancellation_type === "no_refund") {
      return { success: true, amount: 0 };
    }

    if (policy.refund_percentage != null && policy.refund_percentage !== undefined) {
      refundAmount = bookingTotal * (policy.refund_percentage / 100);
    } else if (policy.late_cancellation_type === "full_refund") {
      refundAmount = bookingTotal;
    } else if (policy.late_cancellation_type === "partial_refund") {
      refundAmount = bookingTotal * 0.5;
    }

    if (refundAmount <= 0) {
      return { success: true, amount: 0 };
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("customer_id, booking_number")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking?.customer_id) {
      console.error("Booking not found for refund:", bookingId, bookingError);
      return { success: false, error: "Booking or customer not found" };
    }

    const bookingRef = (booking as { booking_number?: string }).booking_number || bookingId.slice(0, 8);
    const description = `Refund for booking ${bookingRef}: Cancellation - ${policy.late_cancellation_type}`;

    const { error: walletError } = await (supabaseAdmin.rpc as any)("wallet_credit_admin", {
      p_user_id: (booking as { customer_id: string }).customer_id,
      p_amount: refundAmount,
      p_currency: currency || "ZAR",
      p_description: description,
      p_reference_id: bookingId,
      p_reference_type: "booking_refund",
    });

    if (walletError) {
      console.error("Wallet credit failed for cancellation refund:", walletError);
      return { success: false, error: "Failed to credit customer wallet" };
    }

    const { data: refundRecord, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        amount: refundAmount,
        reason: `Cancellation refund - ${policy.late_cancellation_type}`,
        refund_method: "store_credit",
        status: "completed",
        notes: "Cancellation policy refund – credited to customer wallet",
      })
      .select("id")
      .single();

    if (refundError) {
      console.error("Error creating refund record:", refundError);
      return { success: false, error: "Failed to create refund record" };
    }

    return {
      success: true,
      refundId: (refundRecord as { id: string })?.id,
      amount: refundAmount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process refund";
    console.error("Error processing refund:", error);
    return { success: false, error: message };
  }
}
