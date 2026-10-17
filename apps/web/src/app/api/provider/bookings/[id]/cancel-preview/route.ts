import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { loadCancellationOutcomeForBooking } from "@/lib/bookings/load-cancellation-outcome";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import type { CancelActor } from "@/lib/bookings/resolve-cancellation-outcome";

/**
 * GET /api/provider/bookings/[id]/cancel-preview?initiator=provider|customer_requested
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("cancel_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const { id: bookingId } = await params;
    const initiator = new URL(request.url).searchParams.get("initiator") ?? "provider";
    const actor: CancelActor =
      initiator === "customer_requested" ? "provider_customer_requested" : "provider";

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { booking, outcome, error } = await loadCancellationOutcomeForBooking(
      supabase,
      bookingId,
      actor,
    );

    if (error || !booking || !outcome) {
      return handleApiError(new Error("Booking not found"), "Booking not found", "NOT_FOUND", 404);
    }

    if (booking.provider_id !== providerId) {
      return errorResponse("Booking not found", "NOT_FOUND", 404);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null,
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingTotal = Number(booking.total_amount ?? 0);

    return successResponse({
      allowed: outcome.allowed,
      reason: outcome.blockReason,
      block_code: outcome.blockCode,
      is_late_cancellation: outcome.isLate,
      currency: booking.currency ?? LAST_RESORT_CURRENCY,
      booking_total: roundCurrency2(bookingTotal),
      expected_cancellation_fee: outcome.feeRetained,
      expected_wallet_refund: outcome.walletRefund,
      in_person_refund_due: outcome.inPersonRefundDue,
      penalty_waived_reason: outcome.penaltyWaivedReason,
      platform_collected: outcome.platformCollected,
      no_show_available_at: outcome.noShowAvailableAt,
      refund_capped_by_paid_amount: outcome.walletRefund < bookingTotal,
      initiator: actor,
      policy: {
        hours_before_cutoff: outcome.policy.hours_before_cutoff,
        grace_window_minutes: outcome.policy.grace_window_minutes,
        late_cancellation_type: outcome.policy.late_cancellation_type,
        refund_percentage:
          outcome.policy.refund_percentage != null
            ? Number(outcome.policy.refund_percentage)
            : null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to preview cancellation");
  }
}
