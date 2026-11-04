import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { normalizeGroupBookingId, resolveMeGroupAccess } from "@/lib/bookings/me-group-access";
import { resendGroupGuestInvite } from "@/lib/bookings/resend-group-guest-invite";
import { resendInviteErrorResponse } from "@/lib/bookings/resend-invite-response";

/**
 * POST /api/me/group-bookings/[id]/participants/[participantId]/invite
 * Organizer re-sends a split-payment guest's invite link.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> },
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: rawId, participantId } = await params;
    const groupId = normalizeGroupBookingId(rawId);
    const admin = getSupabaseAdmin();

    const access = await resolveMeGroupAccess(admin, groupId, user.id);
    if (!access) return notFoundResponse("Group booking not found");
    if (!access.isPrimary) {
      return errorResponse("Only the organizer can re-send invites.", "FORBIDDEN", 403);
    }

    const result = await resendGroupGuestInvite(admin, { groupBookingId: groupId, participantId });
    if (result.ok === false) return resendInviteErrorResponse(result.code);
    return successResponse({ sent: true });
  } catch (error) {
    return handleApiError(error, "Failed to re-send invite");
  }
}
