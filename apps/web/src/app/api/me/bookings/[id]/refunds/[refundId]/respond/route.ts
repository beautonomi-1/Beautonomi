import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { finalizeCashRefund } from "@/lib/bookings/cash-refund-confirmation";

type Action = "confirm" | "dispute";

/**
 * POST /api/me/bookings/[id]/refunds/[refundId]/respond
 * Customer confirms or disputes a pending cash refund.
 * @tenant-hint Booking is loaded with the user-scoped Supabase client (RLS); service role is only used for
 * refund rows already tied to that booking_id after the customer ownership check.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; refundId: string }> },
) {
  try {
    const { id: bookingId, refundId } = await params;
    const { user } = await requireRoleInApi(["customer"], request);
    const body = await request.json().catch(() => ({}));
    const action = (body?.action as Action) ?? "confirm";

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, customer_id")
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (!booking) {
      return errorResponse("Booking not found", "NOT_FOUND", 404);
    }

    const { data: refund } = await supabaseAdmin
      .from("booking_refunds")
      .select("id, booking_id, status, customer_confirmation_required, customer_disputed_at")
      .eq("id", refundId)
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (!refund) {
      return errorResponse("Refund not found", "NOT_FOUND", 404);
    }

    if ((refund as { status?: string }).status !== "pending") {
      return errorResponse("This refund is no longer pending", "INVALID_STATUS", 400);
    }

    if (action === "dispute") {
      await supabaseAdmin
        .from("booking_refunds")
        .update({
          status: "failed",
          customer_disputed_at: new Date().toISOString(),
          notes: "Customer disputed this cash refund — flagged for review",
        })
        .eq("id", refundId);

      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "refund_disputed",
        event_data: { refund_id: refundId },
        created_by: user.id,
      });

      return successResponse({ message: "Refund disputed. Our team will review." });
    }

    const result = await finalizeCashRefund(supabaseAdmin, refundId, bookingId, user.id);
    if (result.error) {
      return errorResponse(result.error, "FINALIZE_ERROR", 500);
    }

    await supabaseAdmin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "refunded",
      event_data: { refund_id: refundId, confirmed_by_customer: true },
      created_by: user.id,
    });

    return successResponse({ message: "Refund confirmed" });
  } catch (error) {
    return handleApiError(error, "Failed to respond to refund");
  }
}
