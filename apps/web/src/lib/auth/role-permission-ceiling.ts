/**
 * Permission ceiling for custom role editing (F3-15).
 *
 * A non-owner editor may only put permissions into a role that they hold
 * themselves. Owners (linked `providers.user_id`) and superadmins have no
 * ceiling. Returns the list of disallowed keys (empty = allowed).
 */

import type { PermissionRequestContext, StaffPermissions } from "./permissions";
import { getStaffPermissions, isProviderOwner } from "./permissions";

export async function findRolePermissionsAboveCeiling(
  user: { id: string; role?: string },
  requested: Record<string, boolean> | undefined,
  calendarScope: "own" | "all" | undefined,
  request?: PermissionRequestContext,
): Promise<string[]> {
  if (user.role === "superadmin") return [];
  if (await isProviderOwner(user.id, request)) return [];

  const editorPerms = await getStaffPermissions(user.id, undefined, request);
  const disallowed: string[] = [];
  for (const [key, value] of Object.entries(requested ?? {})) {
    if (value !== true) continue;
    if (editorPerms[key as keyof StaffPermissions] !== true) {
      disallowed.push(key);
    }
  }
  if (calendarScope === "all" && editorPerms.manage_team !== true) {
    disallowed.push("calendar_scope:all");
  }
  return disallowed;
}
