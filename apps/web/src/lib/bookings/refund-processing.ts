/**
 * Refund Processing Logic
 * Handles refunds for cancelled bookings based on cancellation policy
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createRefund, convertToSmallestUnit } from "@/lib/payments/paystack-complete";
import type { CancellationPolicy } from "./cancellation-policy";

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  error?: string;
}

/**
 * Process refund for a cancelled booking
 */
export async function processBookingRefund(
  bookingId: string,
  bookingTotal: number,
  currency: string,
  policy: CancellationPolicy,
  paymentReference?: string
): Promise<RefundResult> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Determine refund amount based on policy
    let refundAmount = 0;
    let _refundType: 'full' | 'partial' | 'none' = 'none';

    if (policy.late_cancellation_type === 'full_refund') {
      refundAmount = bookingTotal;
      _refundType = 'full';
    } else if (policy.late_cancellation_type === 'partial_refund') {
      // Calculate partial refund (e.g., 50% or based on policy)
      // For now, default to 50% - can be made configurable
      refundAmount = bookingTotal * 0.5;
      _refundType = 'partial';
    } else {
      // No refund
      return {
        success: true,
        amount: 0,
      };
    }

    if (refundAmount <= 0) {
      return {
        success: true,
        amount: 0,
      };
    }

    // If no payment reference, check for payment records
    if (!paymentReference) {
      const { data: payments } = await supabaseAdmin
        .from("booking_payments")
        .select("reference, amount, payment_provider")
        .eq("booking_id", bookingId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1);

      if (payments && payments.length > 0) {
        const payment = payments[0];
        if (payment.payment_provider === 'paystack' && payment.reference) {
          paymentReference = payment.reference;
        }
      }
    }

    // If we have a Paystack payment reference, process refund via Paystack
    if (paymentReference) {
      try {
        const amountInSmallestUnit = convertToSmallestUnit(refundAmount);
        const refundResponse = await createRefund({
          transaction: paymentReference,
          amount: amountInSmallestUnit,
          currency: currency,
          customer_note: `Refund for cancelled booking ${bookingId}`,
          merchant_note: `Cancellation refund - Policy: ${policy.late_cancellation_type}`,
        });

        if (refundResponse.status && refundResponse.data) {
          // Create refund record
          const { data: refundRecord, error: refundError } = await supabaseAdmin
            .from("booking_refunds")
            .insert({
              booking_id: bookingId,
              amount: refundAmount,
              reason: `Cancellation refund - ${policy.late_cancellation_type}`,
              refund_method: 'original',
              refund_provider_id: refundResponse.data.id?.toString(),
              status: refundResponse.data.status === 'success' ? 'completed' : 'pending',
              notes: `Processed via Paystack. Refund ID: ${refundResponse.data.id}`,
            })
            .select()
            .single();

          if (refundError) {
            console.error("Error creating refund record:", refundError);
            // Continue even if record creation fails
          }

          return {
            success: refundResponse.status,
            refundId: refundRecord?.id || refundResponse.data.id?.toString(),
            amount: refundAmount,
          };
        }
      } catch (paystackError: any) {
        console.error("Paystack refund error:", paystackError);
        // Fall through to manual refund record
      }
    }

    // If Paystack refund failed or no payment reference, create manual refund record
    // (for cash payments or when Paystack refund is not possible)
    const { data: refundRecord, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        amount: refundAmount,
        reason: `Cancellation refund - ${policy.late_cancellation_type}`,
        refund_method: 'original',
        status: 'pending', // Manual processing required
        notes: `Manual refund processing required. Policy: ${policy.late_cancellation_type}`,
      })
      .select()
      .single();

    if (refundError) {
      throw refundError;
    }

    return {
      success: true,
      refundId: refundRecord.id,
      amount: refundAmount,
    };
  } catch (error: any) {
    console.error("Error processing refund:", error);
    return {
      success: false,
      error: error.message || "Failed to process refund",
    };
  }
}
