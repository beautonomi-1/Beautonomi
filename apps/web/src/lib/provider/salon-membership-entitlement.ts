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
