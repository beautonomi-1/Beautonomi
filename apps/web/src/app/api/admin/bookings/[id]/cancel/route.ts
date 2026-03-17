import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * POST /api/admin/bookings/[id]/cancel
 *
 * Cancel a booking. Superadmin only. Audit logged.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
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

    type BookingRow = { status?: string; customer_id?: string; booking_number?: string };
    const bookingRow = booking as BookingRow;
    if (bookingRow.status === "cancelled") {
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

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      if (bookingRow.customer_id) {
        await sendToUser(
          bookingRow.customer_id,
          {
            title: "Booking Cancelled",
            message: `Your booking ${bookingRow.booking_number ?? ""} has been cancelled.`,
            data: {
              type: "booking_cancelled",
              booking_id: id,
            },
            url: `/account-settings/bookings/${id}`,
          },
          ["push"],
          { appType: "customer" }
        );
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string })?.role ?? "superadmin",
      action: "admin.booking.cancel",
      entity_type: "booking",
      entity_id: id,
      metadata: { reason: body.reason ?? null, booking_number: bookingRow.booking_number },
    });

    return successResponse(updatedBooking);
  } catch (error) {
    return handleApiError(error, "Failed to cancel booking");
  }
}
