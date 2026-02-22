import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * POST /api/admin/bookings/[id]/refund
 *
 * Process a refund for a booking. Uses booking_refunds (same as provider
 * refunds) so that update_booking_payment_status trigger keeps totals in sync.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { amount, reason } = body;

    if (!amount || amount <= 0) {
      return errorResponse("Invalid refund amount", "VALIDATION_ERROR", 400);
    }

    // Verify booking exists and get payment totals
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, total_amount, total_paid, total_refunded, customer_id, booking_number, currency, payment_status")
      .eq("id", id)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const b = booking as {
      total_amount: number;
      total_paid?: number;
      total_refunded?: number;
      payment_status?: string;
      customer_id: string;
      booking_number: string;
      currency?: string;
    };

    if (b.payment_status !== "paid" && b.payment_status !== "partially_paid") {
      return errorResponse("Can only refund paid or partially paid bookings", "INVALID_STATUS", 400);
    }

    const availableForRefund = (b.total_paid ?? 0) - (b.total_refunded ?? 0);
    if (amount > availableForRefund) {
      return errorResponse(
        `Refund amount exceeds available refund amount (R${availableForRefund.toFixed(2)})`,
        "VALIDATION_ERROR",
        400
      );
    }

    // Create refund record in booking_refunds (triggers update_booking_payment_status)
    const { data: refund, error: refundError } = await supabase
      .from("booking_refunds")
      .insert({
        booking_id: id,
        amount,
        reason: reason || "Admin refund",
        refund_method: "manual",
        status: "completed",
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      return handleApiError(refundError, "Failed to create refund");
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as { role?: string }).role || "superadmin",
      action: "admin.refund.create",
      entity_type: "refund",
      entity_id: (refund as { id: string }).id,
      metadata: { booking_id: id, amount, reason },
    });

    // Update booking if full refund
    if (amount >= b.total_amount) {
      await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    // Notify customer
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(b.customer_id, {
        title: "Refund Processed",
        message: `A refund of ${b.currency || "ZAR"} ${amount.toFixed(2)} has been processed for booking ${b.booking_number}.`,
        data: {
          type: "refund_processed",
          booking_id: id,
          refund_id: refund.id,
        },
        url: `/account-settings/bookings/${id}`,
      });
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(refund);
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
