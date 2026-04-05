/**
 * Single source of truth for role and portal resolution.
 * Role comes from public.users.role; provider linkage from providers / provider_staff.
 * Use for server-side routing (/portal page, proxy) and for /api/me/portal.
 */

import type { UserRole } from "@/types/beautonomi";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

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
 * Resolve current user's role and provider linkage from DB (server-only).
 * Use the same Supabase client used for auth (cookie or Bearer).
 */
export async function getUserRoleServer(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").getSupabaseServer>>
): Promise<UserRoleResult | null> {
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) return null;

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", authUser.id)
    .single();

  if (userError || !userRow?.role) return null;

  const role = userRow.role as UserRole;
  let provider_id: string | null = null;
  let provider_status: ProviderStatus = null;

  if (role === "provider_owner" || role === "provider_staff") {
    provider_id = await getProviderIdForUser(authUser.id, supabase);
    if (provider_id) {
      const { data: prov } = await supabase
        .from("providers")
        .select("status")
        .eq("id", provider_id)
        .single();
      provider_status = (prov?.status as ProviderStatus) ?? null;
    }
  }

  return {
    userId: userRow.id,
    role,
    provider_id,
    provider_status,
  };
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
