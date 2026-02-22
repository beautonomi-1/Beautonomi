import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { Booking, AdditionalCharge } from "@/types/beautonomi";

const requestPaymentSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
});

/**
 * POST /api/provider/bookings/[id]/request-payment
 * 
 * Request additional payment from customer during/after service
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validationResult = requestPaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { description, amount } = validationResult.data;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as any;

    // Check if booking is in progress or completed
    if (!["in_progress", "completed"].includes(bookingData.status)) {
      return errorResponse("Can only request additional payment for in-progress or completed bookings", "INVALID_STATUS", 400);
    }

    // Create additional charge row (real table)
    const { data: chargeRow, error: chargeError } = await (supabase
      .from("additional_charges") as any)
      .insert({
        booking_id: id,
        description,
        amount,
        currency: bookingData.currency || "ZAR",
        status: "pending",
        requested_by: user.id,
        requested_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (chargeError || !chargeRow) {
      throw chargeError || new Error("Failed to create additional charge");
    }

    const newCharge = chargeRow as AdditionalCharge;

    // Create booking event
    await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "additional_payment_requested",
        event_data: {
          charge_id: newCharge.id,
          description,
          amount,
        },
        created_by: user.id,
      });

    // Notify customer using template
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      await sendTemplateNotification(
        "partial_payment_received",
        [bookingData.customer_id],
        {
          partial_amount: `${newCharge.currency} ${Number(newCharge.amount).toFixed(2)}`,
          remaining_balance: `${newCharge.currency} ${(Number(bookingData.total_amount || 0) + Number(newCharge.amount)).toFixed(2)}`,
          booking_number: bookingData.booking_number || bookingData.ref_number || "",
          booking_id: id,
          charge_description: newCharge.description || "Additional charge",
        },
        ["push", "email"]
      );
    } catch (notifError) {
      console.error("Error sending additional payment request notification:", notifError);
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      charge: newCharge,
      message: "Additional payment request created successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to request additional payment");
  }
}
