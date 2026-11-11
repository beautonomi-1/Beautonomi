/**
 * Access rule for payroll-relevant time records (shifts, time clock) — F3-10.
 *
 * A staff member may act on their OWN records; acting on a colleague's records
 * requires `manage_team` (owners and superadmins always pass).
 */
import type { PermissionRequestContext } from "./permissions";
import { hasPermission, isProviderOwner } from "./permissions";

export async function canActOnStaffTimeRecords(
  user: { id: string; role?: string },
  targetStaff: { user_id?: string | null } | null | undefined,
  request?: PermissionRequestContext,
): Promise<boolean> {
  if (user.role === "superadmin") return true;
  if (targetStaff?.user_id && targetStaff.user_id === user.id) return true;
  if (await isProviderOwner(user.id, request)) return true;
  return hasPermission(user.id, "manage_team", undefined, request);
}

export const STAFF_TIME_RECORD_FORBIDDEN_MESSAGE =
  "You can only manage your own hours. Managing other team members' hours requires the Manage team permission.";
