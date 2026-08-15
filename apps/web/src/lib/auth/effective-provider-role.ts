/**
 * Provider role resolution without pulling in staff-invite delivery (Resend/OneSignal).
 * Used by proxy, portal routes, and staff join accept.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { UsersRoleFromDb } from "@/lib/auth/role";

const IMMUTABLE_ROLES = new Set<UsersRoleFromDb>([
  "superadmin",
  "provider_owner",
  "provider_onboarding",
]);

function isAdminRole(role: string | null | undefined): boolean {
  return role === "superadmin" || (typeof role === "string" && role.startsWith("admin_"));
}

/**
 * After staff join (or role self-heal): never demote superadmin/admin/owner.
 * Owners who also join another salon as staff stay `provider_owner`.
 */
export async function persistJoinedProviderRole(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: userRow } = await admin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const currentRole = userRow?.role as UsersRoleFromDb | undefined;
  if (isAdminRole(currentRole) || currentRole === "provider_owner") {
    return;
  }

  const { data: ownerRow } = await admin
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const nextRole: UsersRoleFromDb = ownerRow ? "provider_owner" : "provider_staff";
  await admin.from("users").update({ role: nextRole }).eq("id", userId);
}

/**
 * After leave/deactivate/onboarding: keep users.role aligned with workplaces.
 * Never demotes provider_owner or admins. Staff with no workplace become
 * provider_onboarding so they can start their own business in the Partner app.
 */
export async function syncPortalRoleAfterWorkplaceChange(userId: string): Promise<UsersRoleFromDb | null> {
  const admin = getSupabaseAdmin();

  const { data: userRow } = await admin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const currentRole = userRow?.role as UsersRoleFromDb | undefined;
  if (!currentRole || isAdminRole(currentRole) || currentRole === "provider_owner") {
    return currentRole ?? null;
  }

  const { data: ownerRow } = await admin
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (ownerRow) {
    // Already returned above when currentRole is provider_owner.
    await admin.from("users").update({ role: "provider_owner" }).eq("id", userId);
    return "provider_owner";
  }

  const { data: staffRow } = await admin
    .from("provider_staff")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (staffRow) {
    if (currentRole !== "provider_staff") {
      await admin.from("users").update({ role: "provider_staff" }).eq("id", userId);
    }
    return "provider_staff";
  }

  if (currentRole === "provider_staff") {
    await admin.from("users").update({ role: "provider_onboarding" }).eq("id", userId);
    return "provider_onboarding";
  }

  return currentRole;
}

/**
 * Elevate `customer` → `provider_owner` / `provider_staff` using admin lookups.
 * Optionally persist owner/staff role to `users.role`.
 */
export async function resolveEffectiveProviderRole(
  userId: string,
  dbRole: UsersRoleFromDb,
  options?: { persist?: boolean },
): Promise<UsersRoleFromDb> {
  if (IMMUTABLE_ROLES.has(dbRole) || isAdminRole(dbRole)) {
    return dbRole;
  }

  if (dbRole === "provider_staff") {
    const admin = getSupabaseAdmin();
    const { data: ownerRow } = await admin
      .from("providers")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (ownerRow) {
      if (options?.persist) {
        await admin.from("users").update({ role: "provider_owner" }).eq("id", userId);
      }
      return "provider_owner";
    }
    if (options?.persist) {
      const healed = await syncPortalRoleAfterWorkplaceChange(userId);
      return healed ?? dbRole;
    }
    return dbRole;
  }

  if (dbRole !== "customer") return dbRole;

  const admin = getSupabaseAdmin();

  const { data: ownerRow } = await admin
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (ownerRow) {
    if (options?.persist) {
      await admin.from("users").update({ role: "provider_owner" }).eq("id", userId);
    }
    return "provider_owner";
  }

  const { data: staffRow } = await admin
    .from("provider_staff")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (staffRow) {
    if (options?.persist) {
      await persistJoinedProviderRole(userId);
    }
    return "provider_staff";
  }

  return dbRole;
}

/** @deprecated Use {@link persistJoinedProviderRole} — kept for imports that expect the old name. */
export async function persistProviderStaffRole(userId: string): Promise<void> {
  return persistJoinedProviderRole(userId);
}
