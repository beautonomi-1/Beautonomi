import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";

export type GroupInviteRow = {
  id: string;
  group_booking_id: string;
  booking_participant_id: string | null;
  invite_token_hash: string;
  invited_name: string | null;
  invited_email: string | null;
  invited_phone: string | null;
  status: string;
  amount_due: number | null;
  currency: string | null;
  expires_at: string | null;
  accepted_by: string | null;
  last_sent_at?: string | null;
};

/** A freshly minted invite plus its raw link token (never stored). */
export type MintedGroupInvite = GroupInviteRow & { token: string };

export function hashGroupInviteToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

function mintRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createGroupBookingInvite(
  admin: SupabaseClient,
  input: {
    groupBookingId: string;
    participantId?: string | null;
    invitedName?: string | null;
    invitedEmail?: string | null;
    invitedPhone?: string | null;
    amountDue?: number | null;
    currency?: string | null;
    expiresAt?: string | null;
  },
): Promise<MintedGroupInvite> {
  const token = mintRawToken();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("group_booking_invites")
    .insert({
      group_booking_id: input.groupBookingId,
      booking_participant_id: input.participantId ?? null,
      invite_token_hash: hashGroupInviteToken(token),
      invited_name: input.invitedName ?? null,
      invited_email: input.invitedEmail ?? null,
      invited_phone: input.invitedPhone ?? null,
      amount_due: input.amountDue ?? null,
      currency: input.currency ?? null,
      expires_at: input.expiresAt ?? null,
      status: "pending",
      last_sent_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Failed to create group invite");
  return { ...(data as GroupInviteRow), token };
}

export async function getGroupInviteByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<GroupInviteRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const { data } = await supabase
    .from("group_booking_invites")
    .select("*")
    .eq("invite_token_hash", hashGroupInviteToken(trimmed))
    .maybeSingle();
  return (data as GroupInviteRow | null) ?? null;
}

export async function getActiveGroupInviteForParticipant(
  admin: SupabaseClient,
  participantId: string,
): Promise<GroupInviteRow | null> {
  const { data } = await admin
    .from("group_booking_invites")
    .select("*")
    .eq("booking_participant_id", participantId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GroupInviteRow | null) ?? null;
}

/**
 * Issue a new link for an existing invite (re-send). The old link stops working because
 * only the latest token hash is stored.
 */
export async function rotateGroupBookingInviteToken(
  admin: SupabaseClient,
  inviteId: string,
): Promise<MintedGroupInvite | null> {
  const token = mintRawToken();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("group_booking_invites")
    .update({ invite_token_hash: hashGroupInviteToken(token), last_sent_at: now, updated_at: now })
    .eq("id", inviteId)
    .in("status", ["pending", "accepted"])
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return { ...(data as GroupInviteRow), token };
}

export async function closeGroupInvitesForParticipant(
  admin: SupabaseClient,
  participantId: string,
  status: "revoked" | "cancelled",
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("group_booking_invites")
    .update({ status, revoked_at: now, updated_at: now })
    .eq("booking_participant_id", participantId)
    .in("status", ["pending", "accepted"]);
}

export async function acceptGroupBookingInvite(
  admin: SupabaseClient,
  token: string,
  userId: string,
): Promise<{ ok: true; invite: GroupInviteRow } | { ok: false; reason: string }> {
  const invite = await getGroupInviteByToken(admin, token);
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.status === "accepted" && invite.accepted_by === userId) {
    return { ok: true, invite };
  }
  if (invite.status !== "pending") return { ok: false, reason: invite.status };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    await admin
      .from("group_booking_invites")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", invite.id);
    return { ok: false, reason: "expired" };
  }
  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("group_booking_invites")
    .update({ status: "accepted", accepted_at: now, accepted_by: userId, updated_at: now })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error || !updated) return { ok: false, reason: "claim_failed" };
  if (invite.booking_participant_id) {
    await admin
      .from("booking_participants")
      .update({ customer_id: userId, updated_at: now })
      .eq("id", invite.booking_participant_id);
  }
  return { ok: true, invite: updated as GroupInviteRow };
}
