import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  errorResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { recalculateGroupBookingTotal } from "@/lib/bookings/recalculate-group-total";
import { cancelGroupGuest } from "@/lib/bookings/cancelGroupGuest";

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

    // Cancel the guest's child booking or remove their tagged lines from the lead booking
    // before the participant row goes, so staff time is freed and totals shrink.
    const guestResult = await cancelGroupGuest(admin, {
      participantId,
      groupBookingId: groupId,
      cancelledBy: user.id,
      reason: "Removed from group booking",
    });
    if (guestResult.ok === false) {
      if (guestResult.code === "PRIMARY_PARTICIPANT") {
        return errorResponse(
          "The primary contact cannot be removed. Cancel the booking instead.",
          "PRIMARY_PARTICIPANT",
          400,
        );
      }
      if (guestResult.code === "BOOKING_CLOSED") {
        return errorResponse(
          "This group booking is already closed.",
          "BOOKING_CLOSED",
          409,
        );
      }
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

    await recalculateGroupBookingTotal(admin, groupId);

    return successResponse({
      success: true,
      mode: guestResult.mode,
      removed_lines: guestResult.removedLines,
      guest_refunded: guestResult.guestRefunded,
      wallet_credited: guestResult.walletCredited,
      overpaid_amount: guestResult.overpaidAmount,
    });
  } catch (error) {
    return handleApiError(error, "Failed to remove group participant");
  }
}
