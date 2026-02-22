import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * POST /api/provider/bookings/[id]/send-payment-link
 * 
 * Send payment link to customer via email or SMS
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to process payments
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
    const { delivery_method } = body; // 'email', 'sms', or 'both'

    if (!delivery_method || !['email', 'sms', 'both'].includes(delivery_method)) {
      return errorResponse(
        "Valid delivery_method is required (email, sms, both)",
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
        customers:users!bookings_customer_id_fkey(
          id, 
          full_name, 
          email, 
          phone
        ),
        providers(
          id,
          business_name
        )
      `)
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    // Check if already paid
    if (booking.payment_status === 'paid') {
      return errorResponse(
        "Booking is already paid",
        "ALREADY_PAID",
        400
      );
    }

    const customer = (booking.customers as any);
    const _provider = (booking.providers as any);
    const customerEmail = customer?.email;
    const customerPhone = customer?.phone;

    // Validate contact info based on delivery method
    if ((delivery_method === 'email' || delivery_method === 'both') && !customerEmail) {
      return errorResponse(
        "Customer email is required for email delivery",
        "VALIDATION_ERROR",
        400
      );
    }

    if ((delivery_method === 'sms' || delivery_method === 'both') && !customerPhone) {
      return errorResponse(
        "Customer phone number is required for SMS delivery",
        "VALIDATION_ERROR",
        400
      );
    }

    // Generate Paystack payment link
    // Superadmin manages Paystack API keys in system settings
    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL}/bookings/${bookingId}/pay`;
    const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();

    // Create notification for customer (will be sent via OneSignal)
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: booking.customer_id,
        type: "payment_link_sent",
        title: "Payment Link Ready",
        message: `Click to pay R${booking.total_amount.toFixed(2)} for booking ${bookingRef} via Paystack.`,
        metadata: {
          booking_id: bookingId,
          booking_ref: bookingRef,
          amount: booking.total_amount,
          payment_link: paymentLink,
          delivery_method,
        },
        link: paymentLink,
      });

      // Send push notification via OneSignal using template
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const channels: ("push" | "email" | "sms")[] = ["push"];
        if (delivery_method === 'email' || delivery_method === 'both') {
          channels.push("email");
        }
        if (delivery_method === 'sms' || delivery_method === 'both') {
          channels.push("sms");
        }

        await sendTemplateNotification(
          "payment_pending",
          [booking.customer_id],
          {
            amount: `R${booking.total_amount.toFixed(2)}`,
            booking_number: bookingRef,
            payment_method: "Paystack",
            booking_id: bookingId,
          },
          channels
        );
      } catch (pushError) {
        console.warn("OneSignal push notification failed:", pushError);
      }
    } catch (notifError) {
      console.warn("Failed to create payment link notification:", notifError);
    }

    // Log the action for debugging
    console.log(`Payment link sent via OneSignal`, {
      bookingId,
      bookingRef,
      customerEmail,
      customerPhone,
      paymentLink,
      amount: booking.total_amount,
    });

    return successResponse({ 
      message: `Payment link sent successfully via ${delivery_method}`,
      payment_link: paymentLink,
      sent_to: {
        email: (delivery_method === 'email' || delivery_method === 'both') ? customerEmail : null,
        phone: (delivery_method === 'sms' || delivery_method === 'both') ? customerPhone : null,
      }
    });
  } catch (error) {
    return handleApiError(error, "Failed to send payment link");
  }
}
