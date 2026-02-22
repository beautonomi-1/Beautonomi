import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

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
      .select("id, total_amount, payment_status, provider_id, customer_id, booking_number, ref_number, total_paid, location_id, location_type")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
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

    // Check if already fully paid
    const currentTotalPaid = booking.total_paid || 0;
    const bookingTotal = booking.total_amount || 0;
    const remainingBalance = bookingTotal - currentTotalPaid;
    
    if (currentTotalPaid >= bookingTotal) {
      return errorResponse(
        "Booking is already fully paid",
        "ALREADY_PAID",
        400
      );
    }

    // Use provided amount or remaining balance (to avoid overpayment)
    // If amount is provided and it's the full total, use it
    // Otherwise, use the remaining balance
    let paymentAmount: number;
    if (amount) {
      // If user explicitly provided an amount, use it (but warn if it exceeds remaining)
      paymentAmount = amount;
      if (paymentAmount > remainingBalance) {
        console.warn(`Payment amount (${paymentAmount}) exceeds remaining balance (${remainingBalance}). Using provided amount.`);
      }
    } else {
      // Default to remaining balance to complete the payment
      paymentAmount = remainingBalance;
    }

    if (paymentAmount <= 0) {
      return errorResponse(
        "Payment amount must be greater than 0",
        "VALIDATION_ERROR",
        400
      );
    }

    // Determine payment provider based on method
    let paymentProvider = 'other';
    if (payment_method === 'cash') {
      paymentProvider = 'cash';
    } else if (payment_method === 'card') {
      paymentProvider = 'yoco'; // Yoco card terminal or manual terminal
    }

    // Create payment record using a database function to properly handle enum types
    // The status column is an enum, and there may be triggers that also need enum values
    // Using RPC ensures proper type casting
    let payment: any = null;
    let paymentError: any = null;
    
    // Try using a database function first (if it exists)
    try {
      const { data: rpcPayment, error: rpcError } = await supabaseAdmin.rpc(
        'create_booking_payment',
        {
          p_booking_id: bookingId,
          p_amount: paymentAmount,
          p_payment_method: payment_method,
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
      // RPC function doesn't exist or failed, continue to fallback
      console.log("RPC function not available, using direct insert");
    }
    
    // Fallback: Direct insert (may fail due to enum, but we'll handle it)
    if (!payment && !paymentError) {
      const paymentData: any = {
        booking_id: bookingId,
        amount: paymentAmount,
        payment_method,
        payment_provider: paymentProvider,
        status: 'completed', // Explicitly set status to 'completed' so trigger counts it
        notes: notes || `Payment received via ${payment_method}`,
        created_by: user.id,
      };
      
      if (reference) {
        paymentData.reference = reference;
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
      console.log(`Payment created: R${paymentAmount.toFixed(2)}. Booking total_paid: R${(updatedBooking.total_paid || 0).toFixed(2)}, status: ${updatedBooking.payment_status}`);
      
      // If total_paid doesn't match expected, log warning
      const expectedTotalPaid = (currentTotalPaid || 0) + paymentAmount;
      if (Math.abs((updatedBooking.total_paid || 0) - expectedTotalPaid) > 0.01) {
        console.warn(`Payment trigger may not have fired correctly. Expected total_paid: R${expectedTotalPaid.toFixed(2)}, Actual: R${(updatedBooking.total_paid || 0).toFixed(2)}`);
      }
    }

    // Note: Booking payment status will be automatically updated by database trigger
    // The trigger update_booking_payment_status() handles this based on payment records

    // Create notification for customer (will be sent via OneSignal)
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: booking.customer_id,
        type: "payment_received",
        title: "Payment Confirmed",
        message: `Your payment of R${paymentAmount.toFixed(2)} has been received and confirmed.`,
        metadata: {
          booking_id: bookingId,
          payment_id: payment.id,
          amount: paymentAmount,
          payment_method,
        },
        link: `/account-settings/bookings/${bookingId}`,
      });

      // Send push notification via OneSignal using template
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
        await sendTemplateNotification(
          "payment_successful",
          [booking.customer_id],
          {
            amount: `R${paymentAmount.toFixed(2)}`,
            booking_number: bookingRef,
            payment_method: payment_method,
            transaction_id: payment.id,
            booking_id: bookingId,
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
      message: "Booking marked as paid successfully" 
    });
  } catch (error) {
    return handleApiError(error, "Failed to mark booking as paid");
  }
}
