import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminUserVerificationSummary = {
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  identity_verification_status: string | null;
};

export type AdminUserListStats = {
  booking_count: number;
  provider_count: number;
};

export type EnrichedAdminUserRow = Record<string, unknown> & {
  stats?: AdminUserListStats;
  verification?: AdminUserVerificationSummary;
  last_sign_in_at?: string | null;
  last_active_at?: string | null;
};

type AuthSignInRow = {
  id: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
};

function pickLatestIso(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const v of values) {
    if (!v) continue;
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = v;
    }
  }
  return best;
}

function buildVerificationSummary(
  row: Record<string, unknown>,
  authRow?: AuthSignInRow | null,
): AdminUserVerificationSummary {
  const emailFromAuth = Boolean(authRow?.email_confirmed_at);
  const phoneFromAuth = Boolean(authRow?.phone_confirmed_at);
  return {
    email_verified: Boolean(row.email_verified) || emailFromAuth,
    phone_verified: Boolean(row.phone_verified) || phoneFromAuth,
    identity_verified: Boolean(row.identity_verified),
    identity_verification_status:
      typeof row.identity_verification_status === "string"
        ? row.identity_verification_status
        : null,
  };
}

/**
 * Attach tenant-scoped stats, auth last sign-in, and verification summary
 * to rows returned by admin_users_list_for_tenant.
 */
export async function enrichAdminUserListRows(
  admin: SupabaseClient,
  tenantId: string,
  users: Record<string, unknown>[],
): Promise<EnrichedAdminUserRow[]> {
  if (users.length === 0) return [];

  const userIds = users
    .map((u) => (typeof u.id === "string" ? u.id : null))
    .filter((id): id is string => Boolean(id));

  const bookingCounts = new Map<string, number>();
  const providerCounts = new Map<string, number>();
  const authByUserId = new Map<string, AuthSignInRow>();

  const [bookingsRes, providersRes, authRes] = await Promise.all([
    userIds.length > 0
      ? admin
          .from("bookings")
          .select("customer_id, user_id")
          .eq("tenant_id", tenantId)
          .or(
            `customer_id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`,
          )
      : Promise.resolve({ data: [] as { customer_id?: string | null; user_id?: string | null }[] }),
    userIds.length > 0
      ? admin
          .from("providers")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id?: string | null }[] }),
    userIds.length > 0
      ? admin.rpc("admin_auth_users_sign_in_batch", { p_user_ids: userIds }).catch((err) => {
          console.warn("[enrichAdminUserListRows] auth batch RPC failed:", err);
          return { data: [] as AuthSignInRow[] };
        })
      : Promise.resolve({ data: [] as AuthSignInRow[] }),
  ]);

  for (const b of bookingsRes.data ?? []) {
    for (const uid of [b.customer_id, b.user_id]) {
      if (!uid || !userIds.includes(uid)) continue;
      bookingCounts.set(uid, (bookingCounts.get(uid) ?? 0) + 1);
    }
  }

  for (const p of providersRes.data ?? []) {
    const uid = p.user_id;
    if (!uid) continue;
    providerCounts.set(uid, (providerCounts.get(uid) ?? 0) + 1);
  }

  for (const row of (authRes.data ?? []) as AuthSignInRow[]) {
    if (row.id) authByUserId.set(row.id, row);
  }

  return users.map((u) => {
    const id = typeof u.id === "string" ? u.id : "";
    const authRow = id ? authByUserId.get(id) : undefined;
    const lastLoginAt =
      typeof u.last_login_at === "string" ? u.last_login_at : null;
    const lastSignInAt = authRow?.last_sign_in_at ?? null;

    return {
      ...u,
      last_sign_in_at: lastSignInAt,
      last_active_at: pickLatestIso(lastSignInAt, lastLoginAt),
      verification: buildVerificationSummary(u, authRow),
      stats: {
        booking_count: bookingCounts.get(id) ?? 0,
        provider_count: providerCounts.get(id) ?? 0,
      },
    };
  });
}
