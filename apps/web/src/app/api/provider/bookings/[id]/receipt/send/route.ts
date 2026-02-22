import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  errorResponse,
  notFoundResponse,
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
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, customer_id, total_amount, completed_at, created_at, booking_number")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !booking) {
      return notFoundResponse("Booking not found");
    }

    const b = booking as any;
    if (!b.customer_id) {
      return errorResponse("Booking has no customer to send receipt to", "VALIDATION_ERROR", 400);
    }

    const totalAmount = b.total_amount || 0;
    const paymentDate = b.completed_at ? new Date(b.completed_at) : new Date(b.created_at);

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
