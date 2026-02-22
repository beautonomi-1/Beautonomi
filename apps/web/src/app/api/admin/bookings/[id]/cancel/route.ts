import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/admin/bookings/[id]/cancel
 * 
 * Cancel a booking
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin']);
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Verify booking exists
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, customer_id, booking_number")
      .eq("id", id)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    if ((booking as any).status === "cancelled") {
      return errorResponse("Booking is already cancelled", "INVALID_STATE", 400);
    }

    // Update booking status
    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
        cancellation_reason: body.reason || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedBooking) {
      return handleApiError(updateError, "Failed to cancel booking");
    }

    // Notify customer
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser((booking as any).customer_id, {
        title: "Booking Cancelled",
        message: `Your booking ${(booking as any).booking_number} has been cancelled.`,
        data: {
          type: "booking_cancelled",
          booking_id: id,
        },
        url: `/account-settings/bookings/${id}`,
      });
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(updatedBooking);
  } catch (error) {
    return handleApiError(error, "Failed to cancel booking");
  }
}
