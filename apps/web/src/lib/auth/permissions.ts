/**
 * Staff Permissions Utilities
 *
 * Handles permission checking for provider staff members.
 * Pass `request` from API route handlers so Bearer-token (mobile) auth uses the same
 * Supabase client as `requireRoleInApi` — otherwise owner/staff lookups run without JWT and fail RLS.
 */

import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDefaultStaffPermissionsForDbRole } from "@/lib/provider/staff-invite-default-permissions";

/** Incoming HTTP request (cookies or Authorization Bearer) for Supabase server client. */
export type PermissionRequestContext = NextRequest | Request | undefined;

export interface StaffPermissions {
  view_calendar?: boolean;
  /** own = only assigned bookings; all = full team calendar (server-enforced). */
  calendar_scope?: "own" | "all";
  create_appointments?: boolean;
  edit_appointments?: boolean;
  cancel_appointments?: boolean;
  delete_appointments?: boolean;
  view_sales?: boolean;
  create_sales?: boolean;
  process_payments?: boolean;
  view_reports?: boolean;
  manage_finance?: boolean;
  manage_marketing?: boolean;
  view_services?: boolean;
  edit_services?: boolean;
  view_products?: boolean;
  edit_products?: boolean;
  view_team?: boolean;
  manage_team?: boolean;
  view_settings?: boolean;
  edit_settings?: boolean;
  view_clients?: boolean;
  edit_clients?: boolean;
  view_reviews?: boolean;
  edit_reviews?: boolean;
  view_messages?: boolean;
  send_messages?: boolean;
  create_explore_posts?: boolean;
  /** Client ratings / staff-initiated client ratings (API routes use these keys) */
  rate_clients?: boolean;
  view_client_ratings?: boolean;
  /** Staff self-service earnings (My earnings). */
  view_own_earnings?: boolean;
}

/**
 * Get staff member's permissions
 *
 * Resolution order:
 * 1. Custom role (role_id) → provider_roles.permissions
 * 2. Direct permissions → provider_staff.permissions
 * 3. Default role permissions → full access unless explicitly revoked
 */
export async function getStaffPermissions(
  userId: string,
  staffId?: string,
  request?: PermissionRequestContext,
): Promise<StaffPermissions> {
  const supabase = await getSupabaseServer(request);

  // Get provider ID
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!provider) {
    // Check if user is staff member
    let staffQuery = supabase
      .from("provider_staff")
      .select("provider_id, role, permissions, role_id, is_admin")
      .eq("user_id", userId);

    if (staffId) {
      staffQuery = staffQuery.eq("id", staffId);
    }

    const { data: staff } = await staffQuery.maybeSingle();

    if (!staff) {
      return {};
    }

    return resolvePermissions(supabase, staff);
  }

  // User is provider owner - get staff member if staffId provided
  if (staffId) {
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("role, permissions, role_id, is_admin")
      .eq("id", staffId)
      .eq("provider_id", provider.id)
      .maybeSingle();

    if (!staff) {
      return {};
    }

    return resolvePermissions(supabase, staff);
  }

  // Provider owner has all permissions
  return getAllPermissions();
}

/**
 * Resolve permissions for a staff member
 */
async function resolvePermissions(
  supabase: any,
  staff: { role: string; permissions?: any; role_id?: string | null; is_admin?: boolean },
): Promise<StaffPermissions> {
  // Owner or admin has all permissions
  if (staff.role === "owner" || staff.is_admin) {
    return getAllPermissions();
  }

  // Check custom role first
  if (staff.role_id) {
    const { data: customRole } = await supabase
      .from("provider_roles")
      .select("permissions, is_active")
      .eq("id", staff.role_id)
      .single();

    if (!customRole || customRole.is_active === false) {
      return {};
    }

    const parsed = parseStoredPermissions(customRole.permissions);
    return parsed.valid ? normalizeStaffPermissions(parsed.value) : {};
  }

  // Check direct permissions
  const directPermissions = parseStoredPermissions(staff.permissions);
  if (directPermissions.hasPayload) {
    if (!directPermissions.valid) {
      return {};
    }
    if (Object.keys(directPermissions.value).length > 0) {
      return normalizeStaffPermissions(directPermissions.value);
    }
  }

  // Fall back to default role permissions
  return getDefaultPermissionsForRole(staff.role);
}

/**
 * Check if staff has specific permission
 */
export async function hasPermission(
  userId: string,
  permission: keyof StaffPermissions,
  staffId?: string,
  request?: PermissionRequestContext,
): Promise<boolean> {
  const permissions = await getStaffPermissions(userId, staffId, request);
  return permissions[permission] === true;
}

/**
 * Get default permissions for role
 */
function getDefaultPermissionsForRole(role: string): StaffPermissions {
  switch (role) {
    case "owner":
      return getAllPermissions();
    case "manager":
      return getDefaultStaffPermissionsForDbRole("manager");
    case "employee":
      return getDefaultStaffPermissionsForDbRole("employee");
    default:
      return {};
  }
}

/**
 * Full permission set for business owner / staff owner row / admin.
 * Exported for `/api/provider/permissions` and staff permission GET fallbacks.
 */
export function getAllPermissions(): StaffPermissions {
  return {
    view_calendar: true,
    calendar_scope: "all",
    create_appointments: true,
    edit_appointments: true,
    cancel_appointments: true,
    delete_appointments: true,
    view_sales: true,
    create_sales: true,
    process_payments: true,
    view_reports: true,
    manage_finance: true,
    manage_marketing: true,
    view_services: true,
    edit_services: true,
    view_products: true,
    edit_products: true,
    view_team: true,
    manage_team: true,
    view_settings: true,
    edit_settings: true,
    view_clients: true,
    edit_clients: true,
    view_reviews: true,
    edit_reviews: true,
    view_messages: true,
    send_messages: true,
    create_explore_posts: true,
    rate_clients: true,
    view_client_ratings: true,
    view_own_earnings: true,
  };
}

const LEGACY_PERMISSION_ALIASES: Record<keyof StaffPermissions, string[]> = {
  view_calendar: ["view_bookings", "manage_bookings"],
  calendar_scope: [],
  create_appointments: [],
  edit_appointments: ["manage_bookings"],
  cancel_appointments: ["manage_bookings"],
  delete_appointments: [],
  view_sales: ["process_sales", "view_finances"],
  create_sales: ["process_sales"],
  process_payments: ["process_sales", "view_finances"],
  view_reports: ["view_finances"],
  manage_finance: ["view_finances", "edit_settings"],
  manage_marketing: [],
  view_services: [],
  edit_services: [],
  view_products: ["manage_products"],
  edit_products: ["manage_products"],
  view_team: ["manage_staff"],
  manage_team: ["manage_staff"],
  view_settings: [],
  edit_settings: [],
  view_clients: [],
  edit_clients: [],
  view_reviews: [],
  edit_reviews: [],
  view_messages: [],
  send_messages: [],
  create_explore_posts: [],
  rate_clients: [],
  view_client_ratings: [],
  view_own_earnings: [],
};

function parseStoredPermissions(permissions: unknown): {
  hasPayload: boolean;
  valid: boolean;
  value: Record<string, unknown>;
} {
  if (permissions == null) {
    return { hasPayload: false, valid: true, value: {} };
  }

  if (typeof permissions === "string") {
    const trimmed = permissions.trim();
    if (!trimmed) {
      return { hasPayload: false, valid: true, value: {} };
    }
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? { hasPayload: true, valid: true, value: parsed as Record<string, unknown> }
        : { hasPayload: true, valid: false, value: {} };
    } catch {
      return { hasPayload: true, valid: false, value: {} };
    }
  }

  if (typeof permissions === "object" && !Array.isArray(permissions)) {
    return { hasPayload: true, valid: true, value: permissions as Record<string, unknown> };
  }

  return { hasPayload: true, valid: false, value: {} };
}

export function normalizeStaffPermissions(
  permissions: Record<string, unknown> | StaffPermissions | null | undefined,
): StaffPermissions {
  const source = permissions ?? {};
  const normalized: StaffPermissions = {};
  const all = getAllPermissions();
  for (const key of Object.keys(all) as Array<keyof StaffPermissions>) {
    if (key === "calendar_scope") {
      const raw = source.calendar_scope;
      normalized.calendar_scope = raw === "all" ? "all" : raw === "own" ? "own" : undefined;
      continue;
    }
    if (source[key] === true || LEGACY_PERMISSION_ALIASES[key]?.some((legacy) => source[legacy] === true)) {
      normalized[key] = true;
    }
  }
  if (!normalized.calendar_scope && normalized.view_calendar) {
    normalized.calendar_scope = normalized.manage_team || normalized.edit_settings ? "all" : "own";
  }
  return normalized;
}

/**
 * Check if user is provider owner (linked in `providers.user_id`).
 */
export async function isProviderOwner(
  userId: string,
  request?: PermissionRequestContext,
): Promise<boolean> {
  const supabase = await getSupabaseServer(request);

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return !!provider;
}

/**
 * Get staff member record for user
 */
export async function getStaffMember(
  userId: string,
  request?: PermissionRequestContext,
): Promise<{
  id: string;
  provider_id: string;
  role: string;
  is_admin: boolean;
} | null> {
  const supabase = await getSupabaseServer(request);

  const { data: staff } = await supabase
    .from("provider_staff")
    .select("id, provider_id, role, is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  return staff || null;
}
