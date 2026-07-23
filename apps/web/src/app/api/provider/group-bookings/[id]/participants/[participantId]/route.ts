import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { recalculateGroupBookingTotal } from "@/lib/bookings/recalculate-group-total";

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

/**
 * DELETE /api/provider/group-bookings/[id]/participants/[participantId]
 * Removes a participant row (booking_participants.id) and clears booking.group_booking_id when set.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: rawGroupId, participantId } = await params;
    const groupId = normalizeGroupBookingId(rawGroupId);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: gb, error: groupError } = await admin
      .from("group_bookings")
      .select("id")
      .eq("id", groupId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }
    if (!gb) {
      return notFoundResponse("Group booking not found");
    }

    const { data: part, error: pErr } = await admin
      .from("booking_participants")
      .select("id, booking_id, group_booking_id")
      .eq("id", participantId)
      .eq("group_booking_id", groupId)
      .maybeSingle();

    if (pErr || !part) {
      return notFoundResponse("Participant not found");
    }

    const { error: dErr } = await admin
      .from("booking_participants")
      .delete()
      .eq("id", participantId)
      .eq("group_booking_id", groupId);

    if (dErr) {
      throw dErr;
    }

    // §Final-audit 2026-04 (P2 residual): previously this endpoint only
    // set `bookings.group_booking_id = null`, leaving the child booking
    // row and its `booking_services` ACTIVE on the calendar. That turned
    // every removed participant into a "phantom block" — staff was still
    // marked busy for a person who had dropped out, and
    // `load-constraints.ts` refused to offer that slot again.
    //
    // Correct behavior: cancel the child booking too, which cascades
    // through the regular cancellation triggers (status → cancelled,
    // `cancelled_at` stamp, availability freed by load-constraints which
    // filters `status !== 'cancelled'`). We do NOT delete the booking —
    // audit trail must be preserved.
    if (part.booking_id) {
      const { error: bookingError } = await admin
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "Removed from group booking",
          group_booking_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", part.booking_id)
        .eq("provider_id", providerId)
        // Do not clobber an already-completed booking.
        .not("status", "in", "(completed,no_show,cancelled)");
      if (bookingError) {
        throw bookingError;
      }

      try {
        const { settleBookingFinanceById } = await import("@/lib/bookings/settle-booking-cancellation");
        await settleBookingFinanceById(admin, part.booking_id, "provider");
      } catch (settleErr) {
        console.error("[group participant remove] finance settlement failed:", settleErr);
      }
    }

    await recalculateGroupBookingTotal(admin, groupId);

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove group participant");
  }
}
