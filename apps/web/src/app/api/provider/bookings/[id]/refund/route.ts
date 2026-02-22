import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * POST /api/provider/bookings/[id]/refund
 * 
 * Issue a refund for a booking
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to process payments (refunds)
    const permissionCheck = await requirePermission('process_payments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const { id: bookingId } = await params;
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Validate input
    const { 
      amount, 
      reason,
      notes 
    } = body;

    if (!amount || amount <= 0) {
      return errorResponse(
        "Refund amount must be greater than 0",
        "VALIDATION_ERROR",
        400
      );
    }

    if (!reason) {
      return errorResponse(
        "Refund reason is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id, 
        booking_number,
        ref_number,
        total_amount, 
        payment_status,
        provider_id, 
        customer_id
      `)
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    // Check if booking is paid or partially paid (can refund both)
    if (booking.payment_status !== 'paid' && booking.payment_status !== 'partially_paid') {
      return errorResponse(
        "Can only refund paid or partially paid bookings",
        "INVALID_STATUS",
        400
      );
    }

    // Get current payment totals from booking (auto-updated by trigger)
    const { data: bookingData } = await supabase
      .from("bookings")
      .select("total_paid, total_refunded")
      .eq("id", bookingId)
      .single();

    const totalPaid = bookingData?.total_paid || 0;
    const totalRefunded = bookingData?.total_refunded || 0;
    const availableForRefund = totalPaid - totalRefunded;

    // Validate refund amount
    if (amount > availableForRefund) {
      return errorResponse(
        `Refund amount (R${amount.toFixed(2)}) exceeds available refund amount (R${availableForRefund.toFixed(2)})`,
        "INVALID_AMOUNT",
        400
      );
    }

    // Get the most recent completed payment for this booking
    const { data: payments } = await supabase
      .from("booking_payments")
      .select("id, amount, payment_provider, payment_provider_id")
      .eq("booking_id", bookingId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    const originalPayment = payments?.[0];

    // Determine refund method based on original payment provider
    let refundMethod = 'manual';
    if (originalPayment?.payment_provider === 'paystack') {
      refundMethod = 'original'; // Refund via Paystack
    } else if (originalPayment?.payment_provider === 'yoco') {
      refundMethod = 'manual'; // Yoco terminal refunds are manual
    } else if (originalPayment?.payment_provider === 'cash') {
      refundMethod = 'cash'; // Cash refund
    }

    // Create refund record
    const { data: refund, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        payment_id: originalPayment?.id || null,
        amount,
        reason,
        refund_method: refundMethod,
        status: refundMethod === 'manual' || refundMethod === 'cash' ? 'completed' : 'pending',
        notes: notes || `Refund via ${refundMethod}`,
        created_by: user.id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      console.error("Error creating refund record:", refundError);
      throw new Error("Failed to create refund record");
    }

    // If payment was via Paystack, process Paystack refund
    if (originalPayment?.payment_provider === 'paystack' && originalPayment?.payment_provider_id) {
      try {
        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        if (!PAYSTACK_SECRET_KEY) {
          throw new Error("Paystack secret key not configured");
        }

        const paystackResponse = await fetch('https://api.paystack.co/refund', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transaction: originalPayment.payment_provider_id,
            amount: Math.round(amount * 100), // Convert to kobo/cents
          }),
        });

        const paystackRefund = await paystackResponse.json();

        if (paystackRefund.status) {
          // Paystack refund initiated successfully
          await supabaseAdmin
            .from("booking_refunds")
            .update({
              refund_provider_id: paystackRefund.data?.id?.toString() || null,
              status: 'completed',
              notes: `Paystack refund processed. Refund ID: ${paystackRefund.data?.id}`,
            })
            .eq("id", refund.id);
        } else {
          // Paystack returned an error
          await supabaseAdmin
            .from("booking_refunds")
            .update({
              status: 'failed',
              notes: `Paystack error: ${paystackRefund.message || 'Unknown error'}`,
            })
            .eq("id", refund.id);
          throw new Error(`Paystack refund failed: ${paystackRefund.message}`);
        }
      } catch (paystackError: any) {
        console.error("Paystack refund failed:", paystackError);
        await supabaseAdmin
          .from("booking_refunds")
          .update({
            status: 'failed',
            notes: `Paystack error: ${paystackError.message || 'Unknown error'}`,
          })
          .eq("id", refund.id);
        throw new Error("Failed to process Paystack refund");
      }
    }

    // Note: Booking payment status will be automatically updated by database trigger
    // The trigger update_booking_payment_status() recalculates totals and status
    const newTotalRefunded = totalRefunded + amount;
    const isFullyRefunded = newTotalRefunded >= totalPaid;

    // Create notification for customer (will be sent via OneSignal)
    try {
      const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
      
      await supabaseAdmin.from("notifications").insert({
        user_id: booking.customer_id,
        type: "refund_processed",
        title: "Refund Processed",
        message: `A refund of R${amount.toFixed(2)} has been processed for booking ${bookingRef}. Reason: ${reason}`,
        metadata: {
          booking_id: bookingId,
          booking_ref: bookingRef,
          refund_id: refund.id,
          amount,
          reason,
        },
        link: `/account-settings/bookings/${bookingId}`,
      });

      // Send push notification via OneSignal using template
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        await sendTemplateNotification(
          "refund_processed",
          [booking.customer_id],
          {
            amount: `R${amount.toFixed(2)}`,
            booking_number: bookingRef,
            refund_reason: reason || "Refund processed",
            booking_id: bookingId,
          },
          ["push", "email"]
        );
      } catch (pushError) {
        console.warn("OneSignal push notification failed:", pushError);
      }
    } catch (notifError) {
      console.warn("Failed to create refund notification:", notifError);
    }

    return successResponse({ 
      refund,
      message: `Refund of R${amount.toFixed(2)} processed successfully`,
      fully_refunded: isFullyRefunded,
    });
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
