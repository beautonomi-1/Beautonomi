/**
 * Role-based action gating. Server remains authoritative — these are
 * conservative client-side defaults to prevent UI exposure of forbidden actions.
 */
export type CalendarPermission =
  | "view_calendar"
  | "manage_bookings"
  | "process_payments"
  | "manage_time_blocks"
  | "manage_availability";

const OWNER_ROLES = new Set(["owner", "admin", "manager"]);
const STAFF_ROLES = new Set([...OWNER_ROLES, "staff"]);

const PERMISSION_MAP: Record<CalendarPermission, (role: string) => boolean> = {
  view_calendar: (role) => STAFF_ROLES.has(role),
  manage_bookings: (role) => STAFF_ROLES.has(role),
  process_payments: (role) => OWNER_ROLES.has(role),
  manage_time_blocks: (role) => OWNER_ROLES.has(role),
  manage_availability: (role) => OWNER_ROLES.has(role),
};

/**
 * Central permission gate. When role is null (not yet loaded) return false for
 * destructive permissions, true for read-only (view_calendar, manage_bookings).
 */
export function canPerformAction(
  role: string | null,
  permission: CalendarPermission,
): boolean {
  if (!role) {
    // Allow basic booking management when role unknown (matches legacy behaviour)
    return permission === "view_calendar" || permission === "manage_bookings";
  }
  return PERMISSION_MAP[permission]?.(role) ?? false;
}

// Convenience wrappers (kept for back-compat with any existing callers)

export function canUseCalendarActions(role: string | null): boolean {
  return canPerformAction(role, "view_calendar");
}

export function canManageBookings(role: string | null): boolean {
  return canPerformAction(role, "manage_bookings");
}

export function canProcessPayments(role: string | null): boolean {
  return canPerformAction(role, "process_payments");
}

export function canManageTimeBlocks(role: string | null): boolean {
  return canPerformAction(role, "manage_time_blocks");
}

export function canManageAvailability(role: string | null): boolean {
  return canPerformAction(role, "manage_availability");
}
