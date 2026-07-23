import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}

/**
 * POST /api/provider/group-bookings/[id]/participants/[participantId]/check-in
 * 
 * Check in a group booking participant
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

    // Fetch the participant first to guard against double check-in rewriting
    // an already-recorded timestamp (idempotent: return existing state if
    // already checked in rather than silently overwriting the original time).
    const { data: existing, error: fetchError } = await admin
      .from("booking_participants")
      .select("id, booking_id, checked_in_at")
      .eq("id", participantId)
      .eq("group_booking_id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) return notFoundResponse("Participant not found");

    if (existing.checked_in_at) {
      return successResponse({
        success: true,
        message: "Participant already checked in",
        checked_in_at: existing.checked_in_at,
        participant: existing,
      });
    }

    const now = new Date().toISOString();
    const { data: participant, error } = await admin
      .from("booking_participants")
      .update({
        checked_in_at: now,
        updated_at: now,
      })
      .eq("id", participantId)
      .eq("group_booking_id", id)
      .is("checked_in_at", null)
      .select("id, booking_id, checked_in_at")
      .maybeSingle();

    if (error || !participant) {
      return notFoundResponse("Participant not found");
    }

    // §Group-booking-audit 2026-05: the participant_participants row is the
    // source of truth for check-in. Treat both the linked booking sync and
    // the parent group status update as best-effort so a transient bookings
    // failure (e.g. RLS or a stale child row) cannot reverse the check-in.
    if (participant.booking_id) {
      const { error: bookingError } = await admin
        .from("bookings")
        .update({
          status: "checked_in",
          checked_in_time: now,
          updated_at: now,
        })
        .eq("id", participant.booking_id)
        .eq("group_booking_id", id)
        .eq("provider_id", group.provider_id)
        .not("status", "in", "(cancelled,no_show)");
      if (bookingError) {
        console.warn(
          "[provider group check-in] linked booking update failed (continuing):",
          bookingError
        );
      }
    }

    const { error: statusError } = await admin
      .from("group_bookings")
      .update({ status: "started", updated_at: now })
      .eq("id", id)
      .eq("provider_id", group.provider_id)
      .not("status", "in", "(completed,cancelled)");
    if (statusError) {
      console.warn(
        "[provider group check-in] group status update failed (continuing):",
        statusError
      );
    }

    return successResponse({
      success: true,
      message: "Participant checked in successfully",
      checked_in_at: participant.checked_in_at,
      participant,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check in participant");
  }
}
