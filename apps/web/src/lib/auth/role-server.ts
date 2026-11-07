/**
 * Server-only role resolution (Supabase admin + optional cookie/header reads via
 * {@link getProviderIdForUser}). Import from route handlers and RSC — not from
 * client components (see {@link "./role"} for shared types and portal helpers).
 */

import type { User as AuthUser } from "@supabase/supabase-js";
import type { UserRole } from "@/types/beautonomi";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ProviderStatus, UserRoleResult, UsersRoleFromDb } from "./role";
import { resolveEffectiveProviderRole } from "@/lib/auth/effective-provider-role";

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
      console.error("[auth.role-server] ensurePublicUserRowExists upsert failed", {
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

    console.info("[auth.role-server] self-healed public.users row", {
      user_id: authUser.id,
      via: "ensurePublicUserRowExists",
    });
    return true;
  } catch (err) {
    console.error("[auth.role-server] ensurePublicUserRowExists threw", {
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
  let authUser: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) return null;
    authUser = data.user;
  } catch {
    // Bearer setSession can throw from a non-auth failure. That must not become
    // a 500 — the mobile gate renders "Couldn't verify your account" for any
    // non-401. No user means the route returns 401.
    return null;
  }
  if (!authUser) return null;

  // Cookie sessions read public.users through RLS. Bearer clients sometimes
  // cannot: createSupabaseClientFromToken stores the access token as the
  // refresh token, and a failed refresh makes PostgREST fall back to the anon
  // key. The row still exists (web login proves it). Read it with the admin
  // client after getUser() has already verified the JWT.
  let userRow: { id: string; role: string } | null = null;
  try {
    const { data, error: userError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();
    if (!userError && data?.role) userRow = data;
  } catch {
    userRow = null;
  }

  if (!userRow?.role) {
    try {
      const admin = getSupabaseAdmin();
      const { data } = await admin
        .from("users")
        .select("id, role")
        .eq("id", authUser.id)
        .maybeSingle();
      if (data?.role) userRow = data;
    } catch {
      userRow = null;
    }
  }

  if (!userRow?.role) return null;

  const rawRole = userRow.role as UsersRoleFromDb;
  const role = await resolveEffectiveProviderRole(userRow.id, rawRole, { persist: false });

  let provider_id: string | null = null;
  let provider_status: ProviderStatus = null;

  if (role === "provider_owner" || role === "provider_staff" || role === "provider_onboarding") {
    provider_id = await getProviderIdForUser(authUser.id, supabase);
    let statusClient: typeof supabase | ReturnType<typeof getSupabaseAdmin> = supabase;
    if (!provider_id) {
      try {
        const admin = getSupabaseAdmin();
        provider_id = await getProviderIdForUser(authUser.id, admin);
        statusClient = admin;
      } catch {
        provider_id = null;
      }
    }
    if (provider_id) {
      try {
        const { data: prov } = await statusClient
          .from("providers")
          .select("status")
          .eq("id", provider_id)
          .maybeSingle();
        provider_status = (prov?.status as ProviderStatus) ?? null;
      } catch {
        provider_status = null;
      }
    }
  }

  return {
    userId: userRow.id,
    role,
    provider_id,
    provider_status,
  };
}
