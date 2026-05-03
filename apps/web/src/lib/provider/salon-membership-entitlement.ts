/**
 * Whether a salon `user_memberships` row qualifies for membership pricing,
 * matching `validate-booking.ts` membership discount logic:
 * - status must be `active`
 * - `expires_at` must be absent or in the future
 * - the linked plan must not be deactivated (`is_active !== false`)
 */

export function isSalonMembershipEntitledForDiscount(params: {
  status: string;
  expires_at: string | null | undefined;
  planIsActive: boolean | null | undefined;
}): boolean {
  if (params.status !== "active") return false;
  const exp = params.expires_at;
  if (exp) {
    const t = new Date(exp).getTime();
    if (Number.isFinite(t) && t < Date.now()) return false;
  }
  return params.planIsActive !== false;
}

/**
 * §Provider-audit 2026-05: shared resolver for the salon (`user_memberships`)
 * + platform (`customer_memberships`) membership discount applied to a booking.
 *
 * The provider new-booking flow used to ignore membership benefits entirely —
 * a long-standing parity gap with the public/customer checkout. This helper
 * lets both surfaces compute the *same* discount so bookings created via the
 * provider app (or any internal tool) carry the correct membership pricing,
 * `membership_plan_id`, and commission base.
 */
export interface MembershipDiscountResult {
  membershipPlanId: string | null;
  membershipId: string | null;
  membershipDiscountAmount: number;
}

export async function resolveMembershipDiscount(params: {
  // We deliberately accept the loose Supabase client shape so this helper
  // works equally with `supabase` (anon) and `supabaseAdmin` (service).
  supabase: { from: (table: string) => any };
  customerId: string | null | undefined;
  providerId: string;
  /** Pre-discount subtotal that the membership discount is calculated against. */
  subtotal: number;
}): Promise<MembershipDiscountResult> {
  const result: MembershipDiscountResult = {
    membershipPlanId: null,
    membershipId: null,
    membershipDiscountAmount: 0,
  };
  if (!params.customerId || params.subtotal <= 0) return result;

  const percentOf = (value: number, pct: number) =>
    Math.round(value * (pct / 100) * 100) / 100;

  try {
    // Salon membership (per-provider): take the most recent qualifying row.
    const { data: membership } = await params.supabase
      .from("user_memberships")
      .select("status, expires_at, plan:membership_plans(id, provider_id, discount_percent, is_active)")
      .eq("user_id", params.customerId)
      .eq("provider_id", params.providerId)
      .maybeSingle();

    const planProviderId = membership?.plan?.provider_id ?? null;
    const planMatchesProvider = planProviderId === params.providerId;
    const entitled =
      planMatchesProvider &&
      isSalonMembershipEntitledForDiscount({
        status: membership?.status ?? "",
        expires_at: membership?.expires_at ?? null,
        planIsActive: membership?.plan?.is_active,
      });

    if (entitled && membership?.plan) {
      result.membershipPlanId = membership.plan.id || null;
      const pct = Number(membership.plan.discount_percent || 0);
      if (pct > 0) {
        result.membershipDiscountAmount = Math.min(
          params.subtotal,
          Math.max(0, percentOf(params.subtotal, pct)),
        );
      }
    }

    // Platform membership: only beat the salon plan if it offers more.
    const { data: platformMemberships } = await params.supabase
      .from("customer_memberships")
      .select(
        "id, status, expires_at, provider_id, membership:memberships(id, discount_percentage, discount_cap_per_booking, discount_applies_to)",
      )
      .eq("customer_id", params.customerId)
      .eq("status", "active");

    for (const row of platformMemberships ?? []) {
      const providerScope = row.provider_id ?? null;
      if (providerScope && providerScope !== params.providerId) continue;
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
      if (expiresAt != null && Number.isFinite(expiresAt) && expiresAt < Date.now()) continue;
      const m = row.membership;
      if (!m || (m.discount_applies_to && m.discount_applies_to !== "all_services")) continue;
      const pct = Number(m.discount_percentage || 0);
      if (pct <= 0) continue;
      const cap = Number(m.discount_cap_per_booking || 0) || 0;
      let discount = Math.max(0, percentOf(params.subtotal, pct));
      if (cap > 0) discount = Math.min(discount, cap);
      discount = Math.min(discount, params.subtotal);
      if (discount > result.membershipDiscountAmount) {
        result.membershipDiscountAmount = discount;
        result.membershipPlanId = null;
        result.membershipId = m.id || null;
      }
    }
  } catch {
    // membership tables may not exist in some dev envs — silently ignore
  }

  return result;
}
