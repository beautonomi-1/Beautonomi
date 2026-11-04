import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGroupBookingInvite,
  getActiveGroupInviteForParticipant,
  rotateGroupBookingInviteToken,
} from "@/lib/bookings/group-invites";

const RESEND_COOLDOWN_MS = 60_000;

export type ResendGroupGuestInviteResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "NOT_SPLIT" | "SHARE_CLOSED" | "TOO_SOON" };

/**
 * Re-send a split-payment guest's invite link. The token is rotated, so only the newest
 * link works.
 */
export async function resendGroupGuestInvite(
  admin: SupabaseClient,
  input: { groupBookingId: string; participantId: string },
): Promise<ResendGroupGuestInviteResult> {
  const { data: participant, error } = await admin
    .from("booking_participants")
    .select(
      "id, participant_name, participant_email, participant_phone, is_primary_contact, amount_due, amount_paid, participant_payment_status",
    )
    .eq("id", input.participantId)
    .eq("group_booking_id", input.groupBookingId)
    .maybeSingle();
  if (error || !participant) return { ok: false, code: "NOT_FOUND" };
  const p = participant as {
    participant_name?: string | null;
    participant_email?: string | null;
    participant_phone?: string | null;
    is_primary_contact?: boolean;
    amount_due?: number | string | null;
    amount_paid?: number | string | null;
    participant_payment_status?: string | null;
  };
  if (p.is_primary_contact) return { ok: false, code: "NOT_FOUND" };
  if (p.amount_due == null) return { ok: false, code: "NOT_SPLIT" };
  if (
    p.participant_payment_status === "cancelled" ||
    p.participant_payment_status === "paid" ||
    p.participant_payment_status === "waived" ||
    Number(p.amount_paid ?? 0) + 0.005 >= Number(p.amount_due)
  ) {
    return { ok: false, code: "SHARE_CLOSED" };
  }

  const { data: group } = await admin
    .from("group_bookings")
    .select("primary_contact_booking_id")
    .eq("id", input.groupBookingId)
    .maybeSingle();
  const leadId = (group as { primary_contact_booking_id?: string | null } | null)?.primary_contact_booking_id;
  if (!leadId) return { ok: false, code: "NOT_FOUND" };
  const { data: lead } = await admin
    .from("bookings")
    .select("currency, status")
    .eq("id", leadId)
    .maybeSingle();
  const leadRow = lead as { currency?: string | null; status?: string | null } | null;
  if (leadRow?.status && ["cancelled", "completed", "no_show"].includes(leadRow.status)) {
    return { ok: false, code: "SHARE_CLOSED" };
  }

  const existing = await getActiveGroupInviteForParticipant(admin, input.participantId);
  if (
    existing?.last_sent_at &&
    Date.now() - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS
  ) {
    return { ok: false, code: "TOO_SOON" };
  }

  const amountDue = Number(p.amount_due ?? 0);
  const remaining = Math.round(Math.max(0, amountDue - Number(p.amount_paid ?? 0)) * 100) / 100;
  const currency = existing?.currency ?? leadRow?.currency ?? null;
  const minted = existing
    ? await rotateGroupBookingInviteToken(admin, existing.id)
    : await createGroupBookingInvite(admin, {
        groupBookingId: input.groupBookingId,
        participantId: input.participantId,
        invitedName: p.participant_name ?? null,
        invitedEmail: p.participant_email ?? null,
        invitedPhone: p.participant_phone ?? null,
        amountDue,
        currency,
      });
  if (!minted) return { ok: false, code: "SHARE_CLOSED" };

  const { sendGroupBookingNotifications } = await import(
    "@/lib/bookings/group-booking-notifications"
  );
  await sendGroupBookingNotifications(admin, leadId, input.groupBookingId, {
    onlyParticipantId: input.participantId,
    invitesByParticipantId: {
      [input.participantId]: { token: minted.token, amountDue: remaining, currency },
    },
  });
  return { ok: true };
}
