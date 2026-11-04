import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { normalizeGroupBookingId } from "@/lib/bookings/me-group-access";
import { resendGroupGuestInvite } from "@/lib/bookings/resend-group-guest-invite";
import { resendInviteErrorResponse } from "@/lib/bookings/resend-invite-response";

/**
 * POST /api/provider/group-bookings/[id]/participants/[participantId]/invite
 * Re-send a split-payment guest's invite link.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: rawId, participantId } = await params;
    const groupId = normalizeGroupBookingId(rawId);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");
    const { data: gb, error } = await admin
      .from("group_bookings")
      .select("id")
      .eq("id", groupId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (error) throw error;
    if (!gb) return notFoundResponse("Group booking not found");

    const result = await resendGroupGuestInvite(admin, { groupBookingId: groupId, participantId });
    if (result.ok === false) return resendInviteErrorResponse(result.code);
    return successResponse({ sent: true });
  } catch (error) {
    return handleApiError(error, "Failed to re-send invite");
  }
}
