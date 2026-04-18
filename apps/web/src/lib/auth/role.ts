/**
 * Single source of truth for role and portal resolution.
 * Role comes from public.users.role; provider linkage from providers / provider_staff.
 * Use for server-side routing (/portal page, proxy) and for /api/me/portal.
 */

import type { User as AuthUser } from "@supabase/supabase-js";
import type { UserRole } from "@/types/beautonomi";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
 * §Release-audit 2026-04: self-heal a missing `public.users` row for a Bearer/mobile caller,
 * mirroring the upsert that `requireRoleInApi` performs for Bearer tokens. Returns true if
 * the row now exists with a role (newly inserted or already present), false if the heal failed.
 *
 * This exists so routes like `/api/me/portal` that don't go through `requireRoleInApi` (they
 * accept any authenticated user and derive portal from role) still handle the phone-only /
 * pre-trigger signup case without returning 401 forever.
 */
export async function ensurePublicUserRowExists(authUser: AuthUser): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    if (existing?.role) return true;

    const placeholderEmail = authUser.email ?? `${authUser.id}@phone.local`;
    const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const { data: upserted, error: upsertError } = await admin
      .from("users")
      .upsert(
        {
          id: authUser.id,
          email: placeholderEmail,
          full_name:
            (metadata.full_name as string | undefined) ??
            (metadata.name as string | undefined) ??
            null,
          phone: (metadata.phone as string | undefined) ?? null,
          role: "customer" as UserRole,
        },
        { onConflict: "id" }
      )
      .select("id, role")
      .single();

    if (upsertError || !upserted?.role) {
      console.error("[auth.role] ensurePublicUserRowExists upsert failed", {
        user_id: authUser.id,
        error: upsertError?.message ?? "empty upsert result",
      });
      return false;
    }

    await admin
      .from("user_wallets")
      .upsert(
        { user_id: authUser.id, currency: "ZAR" },
        { onConflict: "user_id", ignoreDuplicates: true }
      );

    console.info("[auth.role] self-healed public.users row", {
      user_id: authUser.id,
      via: "ensurePublicUserRowExists",
    });
    return true;
  } catch (err) {
    console.error("[auth.role] ensurePublicUserRowExists threw", {
      user_id: authUser.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
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
