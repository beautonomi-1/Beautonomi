import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { acceptGroupBookingInvite } from "@/lib/bookings/group-invites";
import { buildGroupInviteView, rateLimitGroupInvite } from "@/lib/bookings/group-invite-view";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const limited = await rateLimitGroupInvite(request);
    if (limited) return limited;
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const { token } = await params;
    const admin = getSupabaseAdmin();
    const result = await acceptGroupBookingInvite(admin, token, user.id);
    if (result.ok === false) {
      return errorResponse("Unable to accept this invite.", "INVITE_NOT_ACCEPTABLE", 400, {
        reason: result.reason,
      });
    }
    return successResponse({ invite: await buildGroupInviteView(admin, result.invite) });
  } catch (error) {
    return handleApiError(error, "Failed to accept invite");
  }
}
