import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * DELETE /api/provider/group-bookings/[id]/participants/[participantId]
 * Removes a participant row (booking_participants.id) and clears booking.group_booking_id when set.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id: groupId, participantId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: part, error: pErr } = await supabase
      .from("booking_participants")
      .select("id, booking_id, group_booking_id")
      .eq("id", participantId)
      .eq("group_booking_id", groupId)
      .maybeSingle();

    if (pErr || !part) {
      return notFoundResponse("Participant not found");
    }

    const { data: gb } = await supabase
      .from("group_bookings")
      .select("id")
      .eq("id", groupId)
      .eq("provider_id", providerId)
      .single();

    if (!gb) {
      return notFoundResponse("Group booking not found");
    }

    const { error: dErr } = await supabase
      .from("booking_participants")
      .delete()
      .eq("id", participantId)
      .eq("group_booking_id", groupId);

    if (dErr) {
      throw dErr;
    }

    await supabase
      .from("bookings")
      .update({
        group_booking_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", part.booking_id)
      .eq("provider_id", providerId);

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove group participant");
  }
}
