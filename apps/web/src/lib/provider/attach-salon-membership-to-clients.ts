/**
 * §Membership-cancel 2026-05: shared helper for attaching a customer's
 * salon `user_memberships` row (per provider) to a list of client rows.
 *
 * Previously this enrichment lived inline inside `/api/provider/clients`,
 * so the `/serviced` and `/conversations` companion feeds returned the
 * same customer **without** `salon_membership`. The mobile clients tab
 * merges all three feeds with a "first seen wins" strategy, so a client
 * who first appeared from `/serviced` would silently render with no
 * membership pill — even if they had a cancelled `user_memberships` row.
 *
 * Centralising the lookup here keeps every list feed in lockstep and
 * lets the UI rely on `salon_membership.cancelled_at` / `status` to
 * render the "Cancelled" pill regardless of which feed surfaced the
 * client first.
 */

import { isSalonMembershipEntitledForDiscount } from "@/lib/provider/salon-membership-entitlement";

export interface SalonMembershipForClient {
  subscription_id: string;
  plan_id: string;
  plan_name: string | null;
  plan_is_active: boolean;
  status: string;
  expires_at: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  /** Matches booking discount eligibility (`validate-booking.ts`). */
  is_entitled: boolean;
}

interface SupabaseLikeClient {
  from: (table: string) => any;
}

/**
 * Build a `customer_id -> salon membership` map for the given provider.
 * Returns an empty map on any error so callers can degrade gracefully
 * (no crash, no membership pill — same as the original inline logic).
 */
export async function buildSalonMembershipMap(
  providerId: string,
  customerIds: string[],
  supabaseAdmin: SupabaseLikeClient,
): Promise<Map<string, SalonMembershipForClient>> {
  const map = new Map<string, SalonMembershipForClient>();
  if (!providerId || customerIds.length === 0) return map;

  const { data: umRows, error: umErr } = await supabaseAdmin
    .from("user_memberships")
    .select("id, user_id, plan_id, status, expires_at, started_at, cancelled_at")
    .eq("provider_id", providerId)
    .in("user_id", customerIds);

  if (umErr) {
    // eslint-disable-next-line no-console
    console.error("[provider/clients] user_memberships fetch failed:", umErr);
    return map;
  }

  const planIds = [
    ...new Set(
      (umRows ?? []).map((r: { plan_id: string }) => r.plan_id).filter(Boolean),
    ),
  ];

  let planById = new Map<string, { name: string | null; is_active: boolean | null }>();
  if (planIds.length > 0) {
    const { data: plans } = await supabaseAdmin
      .from("membership_plans")
      .select("id, name, is_active")
      .in("id", planIds);
    planById = new Map(
      (plans ?? []).map((p: { id: string; name: string; is_active: boolean }) => [
        p.id,
        { name: p.name, is_active: p.is_active },
      ]),
    );
  }

  for (const r of umRows ?? []) {
    const row = r as {
      id: string;
      user_id: string;
      plan_id: string;
      status: string;
      expires_at: string | null;
      started_at: string | null;
      cancelled_at: string | null;
    };
    const pm = planById.get(row.plan_id);
    const planIsActive = pm?.is_active;
    map.set(row.user_id, {
      subscription_id: row.id,
      plan_id: row.plan_id,
      plan_name: pm?.name ?? null,
      plan_is_active: planIsActive !== false,
      status: row.status,
      expires_at: row.expires_at,
      started_at: row.started_at,
      cancelled_at: row.cancelled_at,
      is_entitled: isSalonMembershipEntitledForDiscount({
        status: row.status,
        expires_at: row.expires_at,
        planIsActive,
      }),
    });
  }

  return map;
}

/**
 * Attach `salon_membership` to each row in-place (returning a new array)
 * by looking up the customer id via the supplied accessor. The caller
 * supplies the accessor so this helper works for both
 * `provider_clients`-style rows (`customer_id` field) and
 * `serviced` / `conversations` rows (also `customer_id`).
 */
export function attachSalonMembership<T extends Record<string, unknown>>(
  rows: T[],
  customerIdOf: (row: T) => string | null | undefined,
  membershipByUserId: Map<string, SalonMembershipForClient>,
): (T & { salon_membership: SalonMembershipForClient | null })[] {
  return rows.map((row) => {
    const id = customerIdOf(row);
    const membership = (id && membershipByUserId.get(id)) || null;
    return { ...row, salon_membership: membership };
  });
}
