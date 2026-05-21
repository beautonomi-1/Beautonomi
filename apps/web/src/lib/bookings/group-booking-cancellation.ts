/**
 * Group Booking Cancellation
 * Handle cancellation of group bookings (all participants or individual)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getGroupBooking } from './group-booking';

/**
 * Cancel entire group booking (all participants)
 */
export async function cancelGroupBooking(
  supabase: SupabaseClient,
  groupBookingId: string,
  cancelledBy: string,
  reason?: string
): Promise<void> {
  const groupBooking = await getGroupBooking(supabase, groupBookingId);
  if (!groupBooking) {
    throw new Error('Group booking not found');
  }

  // Cancel all bookings in the group
  const cancelledBookingIds: string[] = [];
  for (const booking of groupBooking.bookings) {
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelledBy,
        cancellation_reason: reason || 'Group booking cancelled',
      })
      .eq('id', booking.id);
    if (!error) cancelledBookingIds.push(booking.id);
  }

  // Notify waitlist for freed slots
  try {
    const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
    await Promise.allSettled(
      cancelledBookingIds.map((bid) => matchWaitlistOnCancellation(supabase, bid))
    );
  } catch (waitlistErr) {
    console.error("[group cancel] waitlist matching failed:", waitlistErr);
  }

  // Update group booking status
  await supabase
    .from('group_bookings')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', groupBookingId);
}

/**
 * Cancel an individual participant from a group booking.
 *
 * If the participant is the primary contact the entire group is cancelled
 * (same as cancelling the lead booking).
 *
 * For non-primary participants the linked child booking is cancelled (not
 * deleted — audit trail must be preserved) and unlinked from the group.
 * The booking_participants row stays for history; it is not deleted.
 *
 * NOTE: this function is not called by any API route today. The authoritative
 * cancel path is:
 *   • Customer cancel → POST /api/me/bookings/[id]/cancel → calls cancelGroupBooking
 *   • Provider remove participant → DELETE /api/provider/group-bookings/[id]/participants/[pid]
 * If you need to invoke group participant cancellation programmatically (e.g. a
 * future cron or admin action), use this helper rather than writing ad-hoc SQL.
 */
export async function cancelGroupBookingParticipant(
  supabase: SupabaseClient,
  bookingId: string,
  participantId: string,
  cancelledBy: string,
  reason?: string
): Promise<void> {
  const { data: participant } = await supabase
    .from('booking_participants')
    .select('id, booking_id, group_booking_id, is_primary_contact')
    .eq('id', participantId)
    .maybeSingle();

  if (!participant) {
    throw new Error('Participant not found');
  }

  const groupBookingId = participant.group_booking_id as string | null;

  if (participant.is_primary_contact && groupBookingId) {
    // Primary contact leaving cancels the entire group session.
    await cancelGroupBooking(supabase, groupBookingId, cancelledBy, reason);
    return;
  }

  const linkedBookingId = (participant.booking_id ?? bookingId) as string | null;

  if (linkedBookingId) {
    // Cancel the child booking and unlink it from the group.
    // Do NOT delete the booking_participants row — it is the historical record
    // of who was in the group.
    const now = new Date().toISOString();
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        cancelled_by: cancelledBy,
        cancellation_reason: reason || 'Removed from group booking',
        group_booking_id: null,
        updated_at: now,
      })
      .eq('id', linkedBookingId)
      .not('status', 'in', '(completed,no_show,cancelled)');

    try {
      const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
      await matchWaitlistOnCancellation(supabase, linkedBookingId);
    } catch (waitlistErr) {
      console.error("[group participant cancel] waitlist matching failed:", waitlistErr);
    }
  }
}

/**
 * Get group booking participants for cancellation notifications
 */
export async function getGroupBookingParticipantsForCancellation(
  supabase: SupabaseClient,
  groupBookingId: string
): Promise<Array<{
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
}>> {
  const groupBooking = await getGroupBooking(supabase, groupBookingId);
  if (!groupBooking) {
    return [];
  }

  return groupBooking.participants.map(p => ({
    participant_name: p.participant_name,
    participant_email: p.participant_email,
    participant_phone: p.participant_phone,
  }));
}
