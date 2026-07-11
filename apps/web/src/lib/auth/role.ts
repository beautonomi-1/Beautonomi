/**
 * Role and portal resolution shared across server and client.
 * Role comes from public.users.role; provider linkage from providers / provider_staff.
 *
 * For DB-backed resolution on the server ({@link getUserRoleServer},
 * {@link ensurePublicUserRowExists}), import from `./role-server` in route handlers
 * and RSC only — that module pulls `next/headers` transitively and must not be
 * imported from client components.
 */

import type { UserRole } from "@/types/beautonomi";

export type Portal = "customer" | "provider" | "admin" | "provider_onboarding";

/**
 * Legacy value that may still exist in `public.users.role` for users mid-onboarding.
 * Not part of {@link UserRole}; use only for portal routing and API allow-lists.
 */
export type LegacyUsersRole = "provider_onboarding";

/** Role string read from the database — canonical roles plus legacy onboarding. */
export type UsersRoleFromDb = UserRole | LegacyUsersRole;

/** Provider status from DB (providers.status enum) */
export type ProviderStatus = "draft" | "pending_approval" | "active" | "suspended" | null;

export interface UserRoleResult {
  userId: string;
  role: UsersRoleFromDb;
  provider_id: string | null;
  provider_status: ProviderStatus;
}

/**
 * Map role + provider status to a portal identifier for routing.
 */
export function getPortalForUser(params: {
  role: UsersRoleFromDb;
  provider_status?: ProviderStatus | null;
}): Portal {
  const { role, provider_status } = params;

  if (role === "superadmin" || role?.startsWith("admin_")) return "admin";
  if (role === "customer") return "customer";

  // §Release-audit 2026-04: DB can store role = "provider_onboarding" directly
  // (legacy / explicit seed path). Map pre-provider users to the onboarding
  // portal. Once `providers.status` is active, treat like a normal owner so
  // `/api/me/portal` + ProviderPortalGate do not trap them on get-started.
  //
  // §provider-launch (2026-06): `pending_approval` providers (the state right
  // after the onboarding wizard is submitted, when auto-approve is off) now
  // resolve to the live `provider` portal so they land on the dashboard with an
  // "under review" banner instead of being trapped on the onboarding hub.
  // `draft` (wizard not finished) and `suspended` still route to onboarding.
  if (role === "provider_onboarding") {
    if (provider_status === "active" || provider_status === "pending_approval") return "provider";
    return "provider_onboarding";
  }

  if (role === "provider_owner" || role === "provider_staff") {
    if (provider_status === "active" || provider_status === "pending_approval") return "provider";
    // draft / suspended / null
    return "provider_onboarding";
  }

  return "customer";
}

/**
 * Default route for each portal (used by /portal page and redirects).
 */
export function getDefaultRouteForPortal(portal: Portal): string {
  switch (portal) {
    case "admin":
      return "/admin/dashboard";
    case "provider":
      return "/provider/dashboard";
    case "provider_onboarding":
      return "/provider/get-started";
    case "customer":
    default:
      return "/bookings";
  }
}
