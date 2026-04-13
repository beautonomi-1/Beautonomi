import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { bookingTenantMismatchResponse } from "@/lib/tenant/provider-matches-host";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";

/**
 * POST /api/provider/bookings/[id]/mark-paid
 * 
 * Mark a booking as paid (cash/card/other payment method)
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
    if (!user) return notFoundResponse("User not found");

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id: bookingId } = await params;
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Validate input
    const { 
      payment_method, 
      amount, 
      notes,
      reference 
    } = body;

    const validPaymentMethods = ['cash', 'card', 'bank_transfer', 'other'];
    const effectivePaymentMethod = payment_method === 'mobile' ? 'other' : payment_method;
    if (!payment_method || !validPaymentMethods.includes(effectivePaymentMethod)) {
      return errorResponse(
        "Valid payment_method is required (cash, card, bank_transfer, other)",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, tenant_id, total_amount, payment_status, provider_id, customer_id, booking_number, ref_number, total_paid, wallet_amount, gift_card_amount, tip_amount, travel_fee, tax_amount, service_fee_amount, booking_source, location_id, location_type")
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

    const bookingStatus = (booking as { status?: string }).status ?? "";
    if (["cancelled", "refunded", "no_show"].includes(bookingStatus)) {
      return errorResponse(
        `Cannot record payment for a booking with status "${bookingStatus}"`,
        "INVALID_STATUS",
        400
      );
    }
    // Guard: only allow marking paid on confirmed/in_progress/completed bookings
    const validPaymentStatuses = ["confirmed", "in_progress", "completed"];
    if (bookingStatus && !validPaymentStatuses.includes(bookingStatus)) {
      return errorResponse(
        `Cannot record payment for a booking with status "${bookingStatus}"`,
        "INVALID_STATUS",
        400
      );
    }

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

    // If booking is missing location_id and it's an at_salon booking, set it to provider's first location
    if (!booking.location_id && booking.location_type === "at_salon") {
      const { data: providerLocations } = await supabaseAdmin
        .from("provider_locations")
        .select("id")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: true })
        .limit(1);
      
      if (providerLocations && providerLocations.length > 0) {
        const defaultLocationId = providerLocations[0].id;
        const { error: updateError } = await supabaseAdmin
          .from("bookings")
          .update({ location_id: defaultLocationId })
          .eq("id", bookingId);
        
        if (!updateError) {
          console.log(`Updated booking ${bookingId} with location_id ${defaultLocationId}`);
        } else {
          console.warn(`Failed to update location_id for booking ${bookingId}:`, updateError);
        }
      }
    }

    // Check if already fully paid.
    // Remaining balance must account for wallet credit already applied at booking time
    // (wallet_amount reduces what the customer still owes via card/cash/other).
    const currentTotalPaid = booking.total_paid || 0;
    const walletAlreadyApplied = Number((booking as any).wallet_amount || 0);
    const giftCardAlreadyApplied = Number((booking as any).gift_card_amount || 0);
    const bookingTotal = booking.total_amount || 0;
    const remainingBalance = bookingTotal - currentTotalPaid - walletAlreadyApplied - giftCardAlreadyApplied;
    
    if (remainingBalance <= 0) {
      return errorResponse(
        "Booking is already fully paid (including wallet/gift card credits)",
        "ALREADY_PAID",
        400
      );
    }

    let paymentAmount: number;
    if (amount) {
      if (amount > remainingBalance) {
        paymentAmount = remainingBalance;
        console.warn(`Clamped payment amount from ${amount} to remaining balance ${remainingBalance} to prevent overpayment.`);
      } else {
        paymentAmount = amount;
      }
    } else {
      paymentAmount = remainingBalance;
    }

    if (paymentAmount <= 0) {
      return errorResponse(
        "No balance due — booking is already settled via wallet or gift card credits",
        "ALREADY_PAID",
        400
      );
    }

    let paymentProvider = 'other';
    if (effectivePaymentMethod === 'cash') {
      paymentProvider = 'cash';
    } else if (effectivePaymentMethod === 'card') {
      paymentProvider = 'yoco';
    }

    let payment: any = null;
    let paymentError: any = null;

    try {
      const { data: rpcPayment, error: rpcError } = await supabaseAdmin.rpc(
        'create_booking_payment',
        {
          p_booking_id: bookingId,
          p_amount: paymentAmount,
          p_payment_method: effectivePaymentMethod,
          p_payment_provider: paymentProvider,
          p_status: 'completed',
          p_notes: notes || `Payment received via ${payment_method}`,
          p_created_by: user.id,
          p_reference: reference || null,
        }
      );

      if (!rpcError && rpcPayment) {
        payment = Array.isArray(rpcPayment) ? rpcPayment[0] : rpcPayment;
      } else if (rpcError && !rpcError.message?.includes('function') && !rpcError.message?.includes('does not exist')) {
        paymentError = rpcError;
      }
    } catch {
      console.log("RPC function not available, using direct insert");
    }

    if (!payment && !paymentError) {
      const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id;
      const paymentData: any = {
        booking_id: bookingId,
        amount: paymentAmount,
        payment_method: effectivePaymentMethod,
        payment_provider: paymentProvider,
        status: 'completed',
        notes: notes || `Payment received via ${payment_method}`,
        created_by: user.id,
        ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
      };

      if (reference) {
        paymentData.payment_provider_id = reference;
      }
      
      // Try insert with status
      const { data: paymentInserted, error: insertError } = await supabaseAdmin
        .from("booking_payments")
        .insert(paymentData)
        .select()
        .single();
      
      if (insertError) {
        // If insert fails due to status enum, try without status and update after
        if (insertError.message?.includes('status') || insertError.message?.includes('enum')) {
          delete paymentData.status;
          const { data: paymentWithoutStatus, error: insertError2 } = await supabaseAdmin
            .from("booking_payments")
            .insert(paymentData)
            .select()
            .single();
          
          if (insertError2) {
            paymentError = insertError2;
          } else {
            payment = paymentWithoutStatus;
            // Update status after insert
            const { error: updateError } = await supabaseAdmin
              .from("booking_payments")
              .update({ status: 'completed' })
              .eq("id", payment.id);
            
            if (updateError) {
              console.warn("Failed to update payment status after insert:", updateError);
              // Payment was created but status might not be set - trigger should still work
            } else {
              // Refresh to get updated status
              const { data: updated } = await supabaseAdmin
                .from("booking_payments")
                .select()
                .eq("id", payment.id)
                .single();
              if (updated) payment = updated;
            }
          }
        } else {
          paymentError = insertError;
        }
      } else {
        payment = paymentInserted;
        
        // Verify status is set correctly
        if (payment && payment.status !== 'completed') {
          const { error: updateError } = await supabaseAdmin
            .from("booking_payments")
            .update({ status: 'completed' })
            .eq("id", payment.id);
          
          if (!updateError) {
            // Refresh to get updated status
            const { data: updated } = await supabaseAdmin
              .from("booking_payments")
              .select()
              .eq("id", payment.id)
              .single();
            if (updated) payment = updated;
          }
        }
      }
    }
    
    if (paymentError || !payment) {
      console.error("Error creating payment record:", paymentError);
      const errorMessage = paymentError?.message || "Failed to create payment record";
      const errorDetails = paymentError?.details || paymentError;
      
      // Provide helpful error message for enum type issues
      if (errorMessage.includes('payment_status') && errorMessage.includes('enum')) {
        return errorResponse(
          `Database enum error: The payment_status trigger needs to be updated to cast enum values properly. Please run migration 140_fix_payment_status_enum_cast.sql to fix this. Error: ${errorMessage}`,
          "PAYMENT_ENUM_ERROR",
          500,
          errorDetails
        );
      }
      
      return errorResponse(
        errorMessage,
        "PAYMENT_CREATE_ERROR",
        500,
        errorDetails
      );
    }

    // Record booking event for audit trail
    try {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "payment_received",
        event_data: {
          payment_id: payment.id,
          amount: paymentAmount,
          payment_method,
          reference: reference || null,
        },
        created_by: user.id,
      });
    } catch (eventErr) {
      console.warn("Failed to create payment booking event:", eventErr);
    }

    // Verify payment was created with correct status and amount
    if (payment.status !== 'completed') {
      console.warn(`Payment created with status '${payment.status}' instead of 'completed'. Attempting to fix...`);
      const { error: fixError } = await supabaseAdmin
        .from("booking_payments")
        .update({ status: 'completed' })
        .eq("id", payment.id);
      
      if (fixError) {
        console.error("Failed to fix payment status:", fixError);
      } else {
        // Refresh payment to get updated status
        const { data: updatedPayment } = await supabaseAdmin
          .from("booking_payments")
          .select()
          .eq("id", payment.id)
          .single();
        if (updatedPayment) {
          payment = updatedPayment;
        }
      }
    }

    // Verify the trigger updated the booking correctly
    // Wait a moment for trigger to execute, then check
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const { data: updatedBooking } = await supabaseAdmin
      .from("bookings")
      .select("total_paid, payment_status")
      .eq("id", bookingId)
      .single();
    
    if (updatedBooking) {
      console.log(
        `Payment created: ${formatMoney(paymentAmount)}. Booking total_paid: ${formatMoney(updatedBooking.total_paid || 0)}, status: ${updatedBooking.payment_status}`,
      );

      // If total_paid doesn't match expected, log warning
      const expectedTotalPaid = (currentTotalPaid || 0) + paymentAmount;
      if (Math.abs((updatedBooking.total_paid || 0) - expectedTotalPaid) > 0.01) {
        console.warn(
          `Payment trigger may not have fired correctly. Expected total_paid: ${formatMoney(expectedTotalPaid)}, Actual: ${formatMoney(updatedBooking.total_paid || 0)}`,
        );
      }
    }

    // Finance ledger entries are created automatically by the DB trigger
    // (create_finance_ledger_from_payment) when booking_payments rows are inserted.
    // The trigger (migration 458) handles:
    //   - proportional commission based on actual payment amount
    //   - per-payment idempotency via source_payment_id
    //   - booking-level items (tip/tax/travel/service_fee) only once per booking
    //   - live commission rate from platform_settings
    //   - correct handling of 'online', 'walk_in', and 'provider' booking sources
    // No app-level finance_transactions creation needed here.

    // Create notification for customer (will be sent via OneSignal)
    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      await insertNotification({
        user_id: booking.customer_id,
        type: "payment_received",
        title: "Payment Confirmed",
        message: `Your payment of ${formatMoney(paymentAmount)} has been received and confirmed.`,
        data: {
          booking_id: bookingId,
          payment_id: payment.id,
          amount: paymentAmount,
          payment_method,
        },
        action_url: `/account-settings/bookings/${bookingId}`,
      });

      // Send push notification via OneSignal using template
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
        await sendTemplateNotification(
          "payment_successful",
          [booking.customer_id],
          {
            amount: formatMoney(paymentAmount),
            booking_number: bookingRef,
            payment_method: payment_method,
            transaction_id: payment.id,
            booking_id: bookingId,
          },
          ["push", "email"],
          { appType: "customer" }
        );
      } catch (pushError) {
        console.warn("OneSignal push notification failed:", pushError);
      }
    } catch (notifError) {
      console.warn("Failed to create payment notification:", notifError);
    }

    return successResponse({ 
      payment,
      message: "Booking marked as paid successfully" 
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark booking as paid");
  }
}
