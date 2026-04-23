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

/** Provider status from DB (providers.status enum) */
export type ProviderStatus = "draft" | "pending_approval" | "active" | "suspended" | null;

export interface UserRoleResult {
  userId: string;
  role: UserRole;
  provider_id: string | null;
  provider_status: ProviderStatus;
}

/**
 * Map role + provider status to a portal identifier for routing.
 */
export function getPortalForUser(params: {
  role: UserRole;
  provider_status?: ProviderStatus | null;
}): Portal {
  const { role, provider_status } = params;

  if (role === "superadmin" || role?.startsWith("admin_")) return "admin";
  if (role === "customer") return "customer";

  // §Release-audit 2026-04: DB can store role = "provider_onboarding" directly
  // (legacy / explicit seed path). Previously this fell through to `"customer"`,
  // which produced a wrong-app loop on mobile: the portal route returned
  // "customer", so the provider app flipped to WrongApp, and the customer app
  // then tried to gate them through customer onboarding. Map it to the
  // dedicated portal so both apps can route them to provider get-started.
  if (role === "provider_onboarding") return "provider_onboarding";

  if (role === "provider_owner" || role === "provider_staff") {
    if (provider_status === "active") return "provider";
    if (
      provider_status === "draft" ||
      provider_status === "pending_approval" ||
      provider_status === "suspended"
    ) {
      return "provider_onboarding";
    }
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
