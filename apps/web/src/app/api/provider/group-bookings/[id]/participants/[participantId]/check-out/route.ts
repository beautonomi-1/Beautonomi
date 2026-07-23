import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

/**
 * POST /api/provider/group-bookings/[id]/participants/[participantId]/check-out
 * 
 * Check out a group booking participant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const admin = getSupabaseAdmin();
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id: rawId, participantId } = await params;
    const id = normalizeGroupBookingId(rawId);

    const { data: group, error: groupError } = await admin
      .from("group_bookings")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }
    if (!group) {
      return notFoundResponse("Group booking not found");
    }
    if (
      user.role !== "superadmin" &&
      !(await userHasProviderAccessAdmin(admin, user.id, group.provider_id))
    ) {
      return forbiddenResponse("You do not have access to this group booking");
    }

    // Fetch the participant first to enforce check-in-before-check-out ordering
    // and to guard against double check-out resetting an already-recorded time.
    const { data: existing, error: fetchError } = await admin
      .from("booking_participants")
      .select("id, booking_id, checked_in_at, checked_out_at")
      .eq("id", participantId)
      .eq("group_booking_id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) return notFoundResponse("Participant not found");

    if (!existing.checked_in_at) {
      return errorResponse(
        "Participant has not been checked in yet. Check in before checking out.",
        "NOT_CHECKED_IN",
        400
      );
    }

    if (existing.checked_out_at) {
      return successResponse({
        success: true,
        message: "Participant already checked out",
        checked_out_at: existing.checked_out_at,
        participant: existing,
      });
    }

    const now = new Date().toISOString();
    const { data: participant, error } = await admin
      .from("booking_participants")
      .update({
        checked_out_at: now,
        updated_at: now,
      })
      .eq("id", participantId)
      .eq("group_booking_id", id)
      .is("checked_out_at", null)
      .select("id, booking_id, checked_out_at")
      .maybeSingle();

    if (error || !participant) {
      return notFoundResponse("Participant not found");
    }

    // §Group-booking-audit 2026-05: keep participant check-out authoritative
    // even when the linked booking sync or the auto group-status promotion
    // fail; previously a transient bookings/RLS error reverted the check-out
    // entirely.
    if (participant.booking_id) {
      const { error: bookingError } = await admin
        .from("bookings")
        .update({
          status: "completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("id", participant.booking_id)
        .eq("group_booking_id", id)
        .eq("provider_id", group.provider_id)
        .not("status", "in", "(cancelled,no_show)");
      if (bookingError) {
        console.warn(
          "[provider group check-out] linked booking update failed (continuing):",
          bookingError
        );
      }
    }

    await admin
      .from("group_bookings")
      .update({ updated_at: now })
      .eq("id", id)
      .eq("provider_id", group.provider_id);

    const { count, error: remainingError } = await admin
      .from("booking_participants")
      .select("id", { count: "exact", head: true })
      .eq("group_booking_id", id)
      .is("checked_out_at", null);
    if (remainingError) {
      console.warn(
        "[provider group check-out] remaining participant count failed (continuing):",
        remainingError
      );
    } else if (count === 0) {
      const { error: statusError } = await admin
        .from("group_bookings")
        .update({ status: "completed", updated_at: now })
        .eq("id", id)
        .eq("provider_id", group.provider_id)
        .not("status", "in", "(cancelled)");
      if (statusError) {
        console.warn(
          "[provider group check-out] group status update failed (continuing):",
          statusError
        );
      }
    }

    return successResponse({
      success: true,
      message: "Participant checked out successfully",
      checked_out_at: participant.checked_out_at,
      participant,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check out participant");
  }
}
