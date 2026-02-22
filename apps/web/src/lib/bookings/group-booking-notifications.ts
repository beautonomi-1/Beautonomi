/**
 * Group Booking Notifications
 * Send notifications to all participants in a group booking
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getGroupBooking } from './group-booking';

/**
 * Send booking confirmation to all group participants
 */
export async function sendGroupBookingNotifications(
  supabase: SupabaseClient,
  bookingId: string,
  groupBookingId?: string
): Promise<void> {
  // Get group booking details
  let participants: Array<{
    participant_name: string;
    participant_email: string | null;
    participant_phone: string | null;
    is_primary_contact: boolean;
  }> = [];

  if (groupBookingId) {
    const groupBooking = await getGroupBooking(supabase, groupBookingId);
    if (groupBooking) {
      participants = groupBooking.participants.map(p => ({
        participant_name: p.participant_name,
        participant_email: p.participant_email,
        participant_phone: p.participant_phone,
        is_primary_contact: p.is_primary_contact,
      }));
    }
  } else {
    // Fallback: get participants from booking_participants table
    const { data: bookingParticipants } = await supabase
      .from('booking_participants')
      .select('participant_name, participant_email, participant_phone, is_primary_contact')
      .eq('booking_id', bookingId);

    if (bookingParticipants) {
      participants = bookingParticipants;
    }
  }

  // Get booking details
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_number, scheduled_at, provider_id, location_type')
    .eq('id', bookingId)
    .single();

  if (!booking) return;

  // Get provider details
  const { data: provider } = await supabase
    .from('providers')
    .select('business_name, slug')
    .eq('id', booking.provider_id)
    .single();

  // Send notifications to all participants
  for (const participant of participants) {
    if (participant.participant_email) {
      await sendGroupBookingEmail(
        participant.participant_email,
        participant.participant_name,
        booking,
        provider,
        participant.is_primary_contact
      );
    }

    if (participant.participant_phone) {
      await sendGroupBookingSMS(
        participant.participant_phone,
        participant.participant_name,
        booking,
        provider,
        participant.is_primary_contact
      );
    }
  }
}

/**
 * Send email notification to group participant
 */
async function sendGroupBookingEmail(
  email: string,
  name: string,
  booking: any,
  provider: any,
  isPrimary: boolean
): Promise<void> {
  const scheduledDate = new Date(booking.scheduled_at);
  const dateStr = scheduledDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = scheduledDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const subject = isPrimary
    ? `Group Booking Confirmation - ${booking.booking_number}`
    : `You're Invited to a Group Booking - ${booking.booking_number}`;

  const body = `
Hi ${name},

${isPrimary 
  ? `Your group booking has been confirmed!`
  : `You've been added to a group booking!`}

Booking Details:
- Booking Number: ${booking.booking_number}
- Date & Time: ${dateStr} at ${timeStr}
- Provider: ${provider?.business_name || 'Beautonomi Partner'}
- Location: ${booking.location_type === 'at_salon' ? 'At Salon' : 'At Home'}

${isPrimary
  ? 'As the primary contact, you are responsible for this booking. All participants will receive their own confirmation.'
  : 'The primary contact will handle payment and coordination for this group booking.'}

View your booking:
${process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com'}/account-settings/bookings

Best regards,
Beautonomi Team
  `.trim();

  try {
    await fetch('/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject,
        body,
        type: 'group_booking_confirmation',
      }),
    });
  } catch (error) {
    console.warn('Email notification endpoint not available:', error);
  }
}

/**
 * Send SMS notification to group participant
 */
async function sendGroupBookingSMS(
  phone: string,
  name: string,
  booking: any,
  provider: any,
  isPrimary: boolean
): Promise<void> {
  const scheduledDate = new Date(booking.scheduled_at);
  const dateStr = scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = scheduledDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const message = isPrimary
    ? `Hi ${name}! Your group booking ${booking.booking_number} is confirmed for ${dateStr} at ${timeStr}. View: ${process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com'}/account-settings/bookings`
    : `Hi ${name}! You're added to group booking ${booking.booking_number} on ${dateStr} at ${timeStr}. View: ${process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com'}/account-settings/bookings`;

  try {
    await fetch('/api/notifications/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        message,
        type: 'group_booking_confirmation',
      }),
    });
  } catch (error) {
    console.warn('SMS notification endpoint not available:', error);
  }
}
