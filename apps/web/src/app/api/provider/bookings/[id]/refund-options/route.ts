import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { computeRefundCaps } from "@/lib/bookings/booking-refund-limits";

/**
 * GET /api/provider/bookings/[id]/refund-options
 * Caps per refund rail for provider UI.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("issue_refunds", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const { id: bookingId } = await params;
    if (bookingId.startsWith("group:")) {
      return notFoundResponse("Use participant booking id");
    }

    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        "id, customer_id, total_paid, total_refunded, wallet_amount, gift_card_amount, tenant_id, payment_status",
      )
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;
    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const caps = await computeRefundCaps(admin, bookingId, booking);

    const { data: pendingCash } = await admin
      .from("booking_refunds")
      .select("id, amount, status, refund_method")
      .eq("booking_id", bookingId)
      .eq("refund_method", "cash")
      .in("status", ["pending"]);

    return successResponse({
      caps,
      pending_cash_refunds: pendingCash ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load refund options");
  }
}
