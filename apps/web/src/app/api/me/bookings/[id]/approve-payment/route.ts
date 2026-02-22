import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { Booking } from "@/types/beautonomi";

const approvePaymentSchema = z.object({
  charge_id: z.string().uuid(),
  approved: z.boolean(),
});

/**
 * POST /api/me/bookings/[id]/approve-payment
 * 
 * Customer approves or rejects additional payment request
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    const validationResult = approvePaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { charge_id, approved } = validationResult.data;

    // Ensure booking belongs to customer
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    // Update additional charge row
    const { data: chargeRow, error: chargeError } = await (supabase
      .from("additional_charges") as any)
      .update({
        status: approved ? "approved" : "rejected",
        approved_at: approved ? new Date().toISOString() : null,
        approved_by: approved ? user.id : null,
      })
      .eq("id", charge_id)
      .eq("booking_id", id)
      .select("*")
      .single();

    if (chargeError || !chargeRow) {
      return notFoundResponse("Charge not found");
    }

    // Notify provider owner
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const { data: bookingRow } = await supabase
        .from("bookings")
        .select("provider_id, booking_number")
        .eq("id", id)
        .single();

      const providerId = (bookingRow as any)?.provider_id;
      if (providerId) {
        const { data: providerRow } = await supabase
          .from("providers")
          .select("user_id")
          .eq("id", providerId)
          .single();

        const providerUserId = (providerRow as any)?.user_id;
        if (providerUserId) {
          await sendToUser(providerUserId, {
            title: "Additional Payment Update",
            message: `Customer has ${approved ? "approved" : "rejected"} an additional payment request for booking ${(bookingRow as any)?.booking_number || ""}.`,
            data: {
              type: approved ? "additional_payment_approved" : "additional_payment_rejected",
              booking_id: id,
              charge_id,
            },
            url: `/provider/bookings/${id}`,
          });
        }
      }
    } catch (notifError) {
      console.error("Error notifying provider about approval:", notifError);
    }

    // Create booking event
    await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: approved ? "additional_payment_approved" : "additional_payment_rejected",
        event_data: {
          charge_id,
          approved,
        },
        created_by: user.id,
      });

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      message: approved ? "Payment request approved" : "Payment request rejected",
    });
  } catch (error) {
    return handleApiError(error, "Failed to approve payment");
  }
}
