import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveGroupInviteForParticipant } from "@/lib/bookings/group-invites";
import { resendGroupGuestInvite } from "@/lib/bookings/resend-group-guest-invite";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Skip guests whose link went out recently (booking confirmation, manual re-send or an earlier reminder). */
const MIN_GAP_SINCE_LAST_SEND_MS = 20 * 60 * 60 * 1000;
const MAX_CANDIDATES = 500;

const CLOSED_GROUP_STATUSES = new Set(["cancelled", "completed", "no_show"]);

/**
 * Remind split-payment guests with an unpaid share when the appointment is within 24 hours.
 * Each reminder carries a fresh invite link (tokens are hashed, so the old one cannot be re-sent).
 *
 * Candidates are guests with `amount_due` set (split checkout), not the group_payment_mode column,
 * so reminders work even before that column is backfilled on older rows.
 */
export async function sendGroupGuestShareReminders(): Promise<{
  groupGuestShareRemindersSent: number;
}> {
  const admin = getSupabaseAdmin();
  const now = Date.now();

  const { data: participants, error } = await admin
    .from("booking_participants")
    .select(
      "id, group_booking_id, amount_due, amount_paid, is_primary_contact, group_bookings(scheduled_at, status)",
    )
    .eq("participant_payment_status", "pending")
    .not("amount_due", "is", null)
    .eq("is_primary_contact", false)
    .limit(MAX_CANDIDATES);

  if (error) {
    console.warn("[group-guest-share-reminders] participant query failed", error.message);
    return { groupGuestShareRemindersSent: 0 };
  }

  let sent = 0;
  for (const row of (participants ?? []) as Array<{
    id: string;
    group_booking_id: string;
    amount_due: number | string | null;
    amount_paid: number | string | null;
    group_bookings?: { scheduled_at?: string | null; status?: string | null } | null;
  }>) {
    const group = row.group_bookings;
    const status = String(group?.status ?? "").toLowerCase();
    if (CLOSED_GROUP_STATUSES.has(status)) continue;
    const scheduledAt = group?.scheduled_at;
    if (!scheduledAt) continue;
    const t = new Date(scheduledAt).getTime();
    if (t < now || t > now + REMINDER_WINDOW_MS) continue;
    if (Number(row.amount_paid ?? 0) + 0.005 >= Number(row.amount_due ?? 0)) continue;

    const invite = await getActiveGroupInviteForParticipant(admin, row.id);
    if (
      invite?.last_sent_at &&
      now - new Date(invite.last_sent_at).getTime() < MIN_GAP_SINCE_LAST_SEND_MS
    ) {
      continue;
    }

    try {
      const result = await resendGroupGuestInvite(admin, {
        groupBookingId: row.group_booking_id,
        participantId: row.id,
      });
      if (result.ok) sent += 1;
    } catch (err) {
      console.warn("[group-guest-share-reminders] reminder failed", row.id, err);
    }
  }

  return { groupGuestShareRemindersSent: sent };
}
