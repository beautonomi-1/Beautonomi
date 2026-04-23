import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { notifyReceiptSent } from "@/lib/notifications/notification-service";

/**
 * POST /api/provider/bookings/[id]/receipt/send
 *
 * Send booking receipt/invoice to customer via email.
 * Uses OneSignal receipt_sent template.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();

    const { data: booking, error } = await admin
      .from("bookings")
      .select("id, provider_id, customer_id, total_amount, completed_at, created_at, booking_number")
      .eq("id", id)
      .maybeSingle();

    if (error || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingPid = (booking as { provider_id?: string | null }).provider_id;
    if (!bookingPid) {
      return errorResponse("Invalid booking record", "VALIDATION_ERROR", 400);
    }
    const allowed = await userHasProviderAccessAdmin(admin, user.id, bookingPid);
    if (!allowed) {
      return forbiddenResponse("You do not have access to this booking");
    }

    type ReceiptBookingRow = { customer_id?: string; total_amount?: number; completed_at?: string; created_at?: string };
    const b = booking as ReceiptBookingRow;
    if (!b.customer_id) {
      return errorResponse("Booking has no customer to send receipt to", "VALIDATION_ERROR", 400);
    }

    const totalAmount = b.total_amount ?? 0;
    const paymentDate = b.completed_at ? new Date(b.completed_at) : new Date(b.created_at ?? Date.now());

    const result = await notifyReceiptSent(id, totalAmount, paymentDate, ["email"]);

    if (!result.success) {
      return handleApiError(
        new Error(result.error || "Failed to send receipt email"),
        result.error || "Failed to send receipt email"
      );
    }

    return successResponse({
      message: "Receipt sent successfully",
      sent_to: b.customer_id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send receipt");
  }
}
