import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { isProviderOwner, hasPermission } from "@/lib/auth/permissions";
import {
  getProviderStaffIdForUser,
  getTeamRosterDetailLevel,
} from "@/lib/auth/provider-team-roster-access";

/**
 * GET /api/provider/team-access
 * Lightweight flags for provider mobile/web: who can manage team, roster PII level, own staff id.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const staffId = await getProviderStaffIdForUser(user.id, providerId, supabase);
    const rosterDetailLevel = await getTeamRosterDetailLevel(user.id);
    const isOwner = user.role === "superadmin" ? false : await isProviderOwner(user.id);
    const canManageTeam =
      user.role === "superadmin" || isOwner || (await hasPermission(user.id, "manage_team"));
    const canViewTeamFullRoster =
      rosterDetailLevel === "full" || canManageTeam;
    /** Aligns with POST /api/provider/payouts (`requirePermission("process_payments")`). */
    const can_process_payments =
      user.role === "superadmin" ||
      isOwner ||
      (await hasPermission(user.id, "process_payments"));

    return successResponse({
      staff_id: staffId,
      is_business_owner: isOwner,
      roster_detail_level: rosterDetailLevel,
      can_manage_team: canManageTeam,
      can_view_team_roster_pii: canViewTeamFullRoster,
      can_process_payments,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load team access");
  }
}
