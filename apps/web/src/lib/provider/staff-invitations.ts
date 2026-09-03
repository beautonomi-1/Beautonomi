import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * staff_invitations (migration 872) — first-class invite lifecycle records.
 * The 810 token columns on provider_staff remain the join-link source of truth
 * for shipped mobile builds; this table adds status (pending|accepted|revoked|expired),
 * revoke support and an audit trail of every send.
 */

export type StaffInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type StaffInvitationRow = {
  id: string;
  provider_id: string;
  staff_id: string | null;
  email: string;
  phone: string | null;
  status: StaffInvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type StaffInviteAcceptanceOutcome =
  | { ok: true }
  | {
      ok: false;
      code: "INVITE_REVOKED" | "INVITE_EXPIRED" | "STAFF_DEACTIVATED" | "INVITE_ALREADY_ACCEPTED";
    };

/** sha256 hex of the raw UUID token; must match `encode(digest(token, 'sha256'), 'hex')` in 872. */
export function hashStaffInviteToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Pure acceptance matrix (unit-tested):
 *  - revoked  -> INVITE_REVOKED
 *  - expired (status or expires_at in the past) -> INVITE_EXPIRED
 *  - staff row inactive / soft-deleted -> STAFF_DEACTIVATED
 *  - accepted by a different user -> INVITE_ALREADY_ACCEPTED
 */
export function evaluateStaffInviteAcceptance(params: {
  invitation: Pick<StaffInvitationRow, "status" | "expires_at" | "accepted_at"> | null;
  staff: { is_active: boolean | null; deleted_at: string | null; user_id: string | null } | null;
  acceptingUserId: string;
  now?: Date;
}): StaffInviteAcceptanceOutcome {
  const now = params.now ?? new Date();
  const inv = params.invitation;

  if (params.staff && (params.staff.deleted_at || params.staff.is_active === false)) {
    // A deactivated staff member cannot accept, even with a pending token.
    // (An already-linked, active staff re-opening the link is handled below.)
    return { ok: false, code: "STAFF_DEACTIVATED" };
  }

  if (inv) {
    if (inv.status === "revoked") return { ok: false, code: "INVITE_REVOKED" };
    if (inv.status === "accepted") {
      if (params.staff?.user_id && params.staff.user_id !== params.acceptingUserId) {
        return { ok: false, code: "INVITE_ALREADY_ACCEPTED" };
      }
      return { ok: true };
    }
    if (inv.status === "expired") return { ok: false, code: "INVITE_EXPIRED" };
    if (inv.expires_at && new Date(inv.expires_at).getTime() <= now.getTime()) {
      return { ok: false, code: "INVITE_EXPIRED" };
    }
  }

  return { ok: true };
}

export async function loadStaffInvitationByToken(
  admin: SupabaseClient,
  token: string,
): Promise<StaffInvitationRow | null> {
  if (!token.trim()) return null;
  const { data, error } = await admin
    .from("staff_invitations")
    .select("id, provider_id, staff_id, email, phone, status, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashStaffInviteToken(token))
    .maybeSingle();
  if (error) {
    // Table missing (872 not applied yet) → behave as legacy 810 invite.
    if ((error as { code?: string }).code === "42P01") return null;
    throw error;
  }
  return (data as StaffInvitationRow | null) ?? null;
}

/**
 * Record a fresh send. Any previous pending rows for the same staff are marked
 * expired because the provider_staff token was rotated (old links are dead).
 */
export async function recordStaffInvitationSent(
  admin: SupabaseClient,
  params: {
    providerId: string;
    staffId: string;
    email: string;
    phone?: string | null;
    token: string;
    invitedBy: string;
    expiresAt: Date;
    channels: Array<"email" | "push" | "sms">;
  },
): Promise<{ id: string | null }> {
  const nowIso = new Date().toISOString();
  try {
    await admin
      .from("staff_invitations")
      .update({ status: "expired", updated_at: nowIso })
      .eq("staff_id", params.staffId)
      .eq("status", "pending");

    const { data, error } = await admin
      .from("staff_invitations")
      .insert({
        provider_id: params.providerId,
        staff_id: params.staffId,
        email: params.email.trim().toLowerCase(),
        phone: params.phone?.trim() || null,
        token_hash: hashStaffInviteToken(params.token),
        status: "pending",
        channels: params.channels,
        invited_by: params.invitedBy,
        expires_at: params.expiresAt.toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { id: (data as { id?: string } | null)?.id ?? null };
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return { id: null };
    console.warn("[staff-invitations] record send failed:", err);
    return { id: null };
  }
}

/**
 * Revoke all pending invites for a staff member and kill the 810 token so the
 * join link stops validating immediately.
 */
export async function revokeStaffInvitations(
  admin: SupabaseClient,
  params: { providerId: string; staffId: string; revokedBy: string },
): Promise<{ revoked: number }> {
  const nowIso = new Date().toISOString();
  let revoked = 0;
  try {
    const { data, error } = await admin
      .from("staff_invitations")
      .update({ status: "revoked", revoked_at: nowIso, revoked_by: params.revokedBy, updated_at: nowIso })
      .eq("provider_id", params.providerId)
      .eq("staff_id", params.staffId)
      .eq("status", "pending")
      .select("id");
    if (error && (error as { code?: string }).code !== "42P01") throw error;
    revoked = (data ?? []).length;
  } catch (err) {
    console.warn("[staff-invitations] revoke failed:", err);
  }

  const { error: tokenErr } = await admin
    .from("provider_staff")
    .update({ invite_token: null, invite_token_expires_at: null })
    .eq("id", params.staffId)
    .eq("provider_id", params.providerId)
    .is("invite_accepted_at", null);
  if (tokenErr) throw tokenErr;

  return { revoked };
}

export async function markStaffInvitationAccepted(
  admin: SupabaseClient,
  token: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    await admin
      .from("staff_invitations")
      .update({ status: "accepted", accepted_at: nowIso, updated_at: nowIso })
      .eq("token_hash", hashStaffInviteToken(token))
      .eq("status", "pending");
  } catch (err) {
    console.warn("[staff-invitations] mark accepted failed:", err);
  }
}
