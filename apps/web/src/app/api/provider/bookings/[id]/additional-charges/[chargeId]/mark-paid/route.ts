import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * POST /api/provider/bookings/[id]/additional-charges/[chargeId]/mark-paid
 * 
 * Mark an additional charge as paid (for walk-in/in-salon payments)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    // Check permission to process payments
    const permissionCheck = await requirePermission('process_payments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    if (!user) return notFoundResponse("User not found");

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const { id: bookingId, chargeId } = await params;
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Validate input
    const { 
      payment_method, 
      notes,
      reference 
    } = body;

    if (!payment_method || !['cash', 'card', 'mobile', 'bank_transfer', 'other'].includes(payment_method)) {
      return errorResponse(
        "Valid payment_method is required (cash, card, mobile, bank_transfer, other)",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, provider_id, customer_id, booking_number, ref_number, currency")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    // Get additional charge
    const { data: charge, error: chargeError } = await supabase
      .from("additional_charges")
      .select("*")
      .eq("id", chargeId)
      .eq("booking_id", bookingId)
      .single();

    if (chargeError || !charge) {
      return notFoundResponse("Additional charge not found");
    }

    // Check if already paid
    if (charge.status === 'paid') {
      return errorResponse(
        "This charge has already been paid",
        "ALREADY_PAID",
        400
      );
    }

    const chargeAmount = Number(charge.amount);
    const currency = charge.currency || booking.currency || "ZAR";

    // Determine payment provider based on method
    let paymentProvider = 'other';
    if (payment_method === 'cash') {
      paymentProvider = 'cash';
    } else if (payment_method === 'card') {
      paymentProvider = 'yoco'; // Yoco card terminal or manual terminal
    }

    // Create payment record for the additional charge
    const paymentData: any = {
      booking_id: bookingId,
      amount: chargeAmount,
      payment_method,
      payment_provider: paymentProvider,
      status: 'completed',
      notes: notes || `Additional charge payment: ${charge.description} (via ${payment_method})`,
      created_by: user.id,
      metadata: {
        additional_charge_id: chargeId,
        charge_description: charge.description,
      },
    };

    if (reference) {
      paymentData.reference = reference;
    }

    // Insert payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("booking_payments")
      .insert(paymentData)
      .select()
      .single();

    if (paymentError) {
      console.error("Error creating payment record:", paymentError);
      return errorResponse(
        paymentError.message || "Failed to create payment record",
        "PAYMENT_CREATE_ERROR",
        500
      );
    }

    // Update additional charge status to paid
    const { error: updateError } = await supabaseAdmin
      .from("additional_charges")
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq("id", chargeId);

    if (updateError) {
      console.error("Error updating charge status:", updateError);
      // Payment was created but charge status update failed - log but don't fail
    }

    // Create booking event
    await supabaseAdmin
      .from("booking_events")
      .insert({
        booking_id: bookingId,
        event_type: "additional_payment_paid",
        event_data: {
          charge_id: chargeId,
          description: charge.description,
          amount: chargeAmount,
          payment_method,
          payment_id: payment.id,
        },
        created_by: user.id,
      });

    // Notify customer
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: booking.customer_id,
        type: "additional_charge_paid",
        title: "Additional Charge Paid",
        message: `Your additional charge of ${currency} ${chargeAmount.toFixed(2)} has been paid and confirmed.`,
        metadata: {
          booking_id: bookingId,
          charge_id: chargeId,
          amount: chargeAmount,
          payment_method,
        },
        link: `/account-settings/bookings/${bookingId}`,
      });

      // Send push notification
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
        await sendTemplateNotification(
          "payment_successful",
          [booking.customer_id],
          {
            amount: `${currency} ${chargeAmount.toFixed(2)}`,
            booking_number: bookingRef,
            payment_method: payment_method,
            transaction_id: payment.id,
            booking_id: bookingId,
            charge_description: charge.description,
          },
          ["push", "email"]
        );
      } catch (pushError) {
        console.warn("OneSignal push notification failed:", pushError);
      }
    } catch (notifError) {
      console.warn("Failed to create payment notification:", notifError);
    }

    return successResponse({
      payment,
      charge: {
        ...charge,
        status: 'paid',
        paid_at: new Date().toISOString(),
      },
      message: "Additional charge marked as paid successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark additional charge as paid");
  }
}
