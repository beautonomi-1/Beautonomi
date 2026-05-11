import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { bookingTenantMismatchResponse } from "@/lib/tenant/provider-matches-host";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";

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
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
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
        tenant_id,
        booking_number, 
        ref_number,
        total_amount,
        total_paid,
        total_refunded,
        wallet_amount,
        gift_card_amount,
        payment_status,
        provider_id, 
        customer_id,
        location_id,
        additional_charges(amount,status),
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

    const bookingMarketMismatch = bookingTenantMismatchResponse(
      tenantId,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    if (bookingMarketMismatch) return bookingMarketMismatch;

    const { format: formatMoney } = await getTenantMoneyFormatter(
      (booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
    );

    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    // Check if already paid
    if (booking.payment_status === 'paid') {
      return errorResponse(
        "Booking is already paid",
        "ALREADY_PAID",
        400
      );
    }

    type CustomerRow = { email?: string; phone?: string };
    type ProviderRow = { id?: string; business_name?: string };
    const customer = booking.customers as CustomerRow | null;
    const _provider = booking.providers as ProviderRow | null;
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

    const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const paymentLink = `${appBase}/bookings/${bookingId}/pay`;
    const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
    const unpaidAdditionalCharges = Array.isArray((booking as any).additional_charges)
      ? (booking as any).additional_charges
          .filter((charge: any) => charge?.status !== "paid" && charge?.status !== "rejected")
          .reduce((sum: number, charge: any) => sum + Number(charge?.amount || 0), 0)
      : 0;
    const amountDue = computeBookingOutstandingDisplay({
      totalAmount: Number(booking.total_amount ?? 0),
      totalPaid: Number(booking.total_paid ?? 0),
      totalRefunded: Number(booking.total_refunded ?? 0),
      walletAmount: Number(booking.wallet_amount ?? 0),
      giftCardAmount: Number(booking.gift_card_amount ?? 0),
      unpaidAdditionalCharges,
      paymentStatus: booking.payment_status,
    });

    // Create notification for customer (will be sent via OneSignal)
    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      await insertNotification({
        user_id: booking.customer_id,
        type: "payment_link_sent",
        title: "Payment Link Ready",
        message: `Pay ${formatMoney(amountDue)} for booking ${bookingRef}. Open: ${paymentLink}`,
        data: {
          booking_id: bookingId,
          booking_ref: bookingRef,
          amount: booking.total_amount,
          payment_link: paymentLink,
          delivery_method,
        },
        action_url: paymentLink,
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
            amount: formatMoney(amountDue),
            booking_number: String(bookingRef),
            payment_method: "Paystack",
            booking_id: bookingId,
            payment_link: paymentLink,
          },
          channels,
          { appType: "customer" }
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
