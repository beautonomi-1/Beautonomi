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
        customer_id,
        currency
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

    // Refunds always credit the customer's wallet (platform policy: same as admin refunds)
    const { error: walletError } = await (supabaseAdmin.rpc as any)("wallet_credit_admin", {
      p_user_id: booking.customer_id,
      p_amount: amount,
      p_currency: booking.currency || "ZAR",
      p_description: `Refund for booking ${booking.booking_number || booking.ref_number || bookingId.slice(0, 8)}: ${reason}`,
      p_reference_id: bookingId,
      p_reference_type: "booking_refund",
    });

    if (walletError) {
      console.error("Wallet credit failed:", walletError);
      return errorResponse("Failed to credit customer wallet", "WALLET_ERROR", 500);
    }

    // Create refund record (triggers update_booking_payment_status)
    const { data: refund, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        amount,
        reason,
        refund_method: "store_credit",
        status: "completed",
        notes: notes || "Provider refund – credited to customer wallet",
        created_by: user.id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      console.error("Error creating refund record:", refundError);
      return errorResponse("Failed to create refund record", "REFUND_ERROR", 500);
    }

    // Note: Booking payment status is updated by database trigger on booking_refunds
    // The trigger update_booking_payment_status() recalculates totals and status
    const newTotalRefunded = totalRefunded + amount;
    const isFullyRefunded = newTotalRefunded >= totalPaid;

    // Notify customer that refund was added to wallet
    const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
    const currency = booking.currency || "ZAR";
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: booking.customer_id,
        type: "refund_processed",
        title: "Refund added to wallet",
        message: `A refund of ${currency} ${amount.toFixed(2)} for booking ${bookingRef} has been added to your wallet. Use it for your next booking or request a payout.`,
        metadata: {
          booking_id: bookingId,
          booking_ref: bookingRef,
          refund_id: (refund as { id: string }).id,
          amount,
          reason,
        },
        link: "/account-settings/wallet",
      });

      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(
        booking.customer_id,
        {
          title: "Refund added to wallet",
          message: `A refund of ${currency} ${amount.toFixed(2)} for booking ${bookingRef} has been added to your wallet. Use it for your next booking or request a payout.`,
          data: { type: "refund_processed", booking_id: bookingId, refund_id: (refund as { id: string }).id },
          url: "/account-settings/wallet",
        },
        ["push"],
        { appType: "customer" }
      );
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
