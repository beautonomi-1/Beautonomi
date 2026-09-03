import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { isProviderOwner, hasPermission, getStaffPermissions } from "@/lib/auth/permissions";
import { resolveCalendarScope } from "@/lib/auth/calendar-scope";
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
    const rosterDetailLevel = await getTeamRosterDetailLevel(user.id, request);
    const isOwner = user.role === "superadmin" ? false : await isProviderOwner(user.id, request);
    const canManageTeam =
      user.role === "superadmin" || isOwner || (await hasPermission(user.id, "manage_team", undefined, request));
    const canViewTeamFullRoster =
      rosterDetailLevel === "full" || canManageTeam;
    /** POS / mark-paid / terminal collect — not payout requests. */
    const can_process_payments =
      user.role === "superadmin" ||
      isOwner ||
      (await hasPermission(user.id, "process_payments", undefined, request));
    /** Aligns with POST /api/provider/payouts (`requireOwnerOrEditSettings`). */
    const can_request_payouts =
      user.role === "superadmin" ||
      isOwner ||
      (await hasPermission(user.id, "edit_settings", undefined, request));

    const staffPermissions =
      user.role === "superadmin" || isOwner
        ? null
        : await getStaffPermissions(user.id, undefined, request);
    const calendar_scope = isOwner || user.role === "superadmin" ? "all" : resolveCalendarScope(staffPermissions);

    return successResponse({
      staff_id: staffId,
      is_business_owner: isOwner,
      roster_detail_level: rosterDetailLevel,
      can_manage_team: canManageTeam,
      can_view_team_roster_pii: canViewTeamFullRoster,
      can_process_payments,
      can_request_payouts,
      calendar_scope,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load team access");
  }
}
