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
  for (const booking of groupBooking.bookings) {
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelledBy,
        cancellation_reason: reason || 'Group booking cancelled',
      })
      .eq('id', booking.id);
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
 * Cancel individual participant from group booking
 */
export async function cancelGroupBookingParticipant(
  supabase: SupabaseClient,
  bookingId: string,
  participantId: string,
  cancelledBy: string,
  reason?: string
): Promise<void> {
  // Get participant details
  const { data: participant } = await supabase
    .from('booking_participants')
    .select('*, group_bookings(*)')
    .eq('booking_id', bookingId)
    .eq('id', participantId)
    .single();

  if (!participant) {
    throw new Error('Participant not found');
  }

  // Check if this is the primary contact
  if (participant.is_primary_contact) {
    // Primary contact cancellation cancels entire group
    const groupBooking = participant.group_bookings as any;
    if (groupBooking) {
      await cancelGroupBooking(supabase, groupBooking.id, cancelledBy, reason);
    }
  } else {
    // Remove participant's booking_services
    await supabase
      .from('booking_services')
      .delete()
      .eq('booking_id', bookingId)
      .eq('participant_id', participantId);

    // Remove participant record
    await supabase
      .from('booking_participants')
      .delete()
      .eq('id', participantId);

    // If this was the last participant, cancel the booking
    const { data: remainingParticipants } = await supabase
      .from('booking_participants')
      .select('id')
      .eq('booking_id', bookingId);

    if (!remainingParticipants || remainingParticipants.length === 0) {
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: cancelledBy,
          cancellation_reason: reason || 'All participants removed',
        })
        .eq('id', bookingId);
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
