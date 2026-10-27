import { z } from "zod";
import {
  getAllPermissions,
  normalizeStaffPermissions,
  type StaffPermissions,
} from "@/lib/auth/permissions";

const calendarScopeSchema = z.enum(["own", "all"]).optional();

export const staffPermissionsPatchSchema = z.object({
  permissions: z.record(z.string(), z.boolean()),
  calendar_scope: calendarScopeSchema,
});

export const rolePermissionsPayloadSchema = z.object({
  permissions: z.record(z.string(), z.boolean()).optional(),
  calendar_scope: calendarScopeSchema,
});

/** Merge boolean toggles + scope for DB JSON on provider_staff / provider_roles. */
export function staffPermissionsToStoredJson(
  booleans: Record<string, boolean>,
  calendarScope?: "own" | "all",
): Record<string, unknown> {
  const normalized = normalizeStaffPermissions(booleans) as StaffPermissions;
  const scope =
    calendarScope ??
    normalized.calendar_scope ??
    (normalized.view_calendar
      ? normalized.manage_team || normalized.edit_settings
        ? "all"
        : "own"
      : undefined);
  const out: Record<string, unknown> = { ...normalized };
  if (scope) out.calendar_scope = scope;
  else delete out.calendar_scope;
  return out;
}

export function booleanKeysFromStaffPermissions(): string[] {
  return Object.keys(getAllPermissions()).filter((k) => k !== "calendar_scope");
}
