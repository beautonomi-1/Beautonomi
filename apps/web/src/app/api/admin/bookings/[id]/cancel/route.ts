import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";

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
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Admin client unavailable");
    const body = await request.json();
    const tenantId = await resolveAdminApiTenantId(request);

    const loaded = await fetchBookingInAdminTenant(
      supabase,
      id,
      tenantId,
      "id, status, customer_id, booking_number, tenant_id"
    );
    if ("error" in loaded) return loaded.error;

    type BookingRow = { status?: string; customer_id?: string; booking_number?: string };
    const bookingRow = loaded.booking as BookingRow;
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

    try {
      const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
      await matchWaitlistOnCancellation(supabase, id);
    } catch (waitlistErr) {
      console.error("[admin cancel] waitlist matching failed:", waitlistErr);
    }

    return successResponse(updatedBooking);
  } catch (error) {
    return handleApiError(error, "Failed to cancel booking");
  }
}
