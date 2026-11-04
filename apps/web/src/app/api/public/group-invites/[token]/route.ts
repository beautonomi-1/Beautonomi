import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getGroupInviteByToken } from "@/lib/bookings/group-invites";
import { buildGroupInviteView, rateLimitGroupInvite } from "@/lib/bookings/group-invite-view";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const limited = await rateLimitGroupInvite(request);
    if (limited) return limited;
    const { token } = await params;
    const admin = getSupabaseAdmin();
    const invite = await getGroupInviteByToken(admin, token);
    if (!invite) return notFoundResponse("Invite not found");
    return successResponse({ invite: await buildGroupInviteView(admin, invite) });
  } catch (error) {
    return handleApiError(error, "Failed to load invite");
  }
}
