/**
 * Group Booking Notifications
 * Send notifications to registered participants in a group booking.
 *
 * Server-side callers must not call protected internal API routes such as
 * /api/notifications/send-email because those endpoints require a provider or
 * admin session and public booking flows do not have one. This module sends
 * directly through the notification service after resolving a participant to a
 * Beautonomi user by customer_id, email, or phone.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendToUser } from '@/lib/notifications/onesignal';
import { getGroupBooking } from './group-booking';

type GroupNotificationParticipant = {
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  is_primary_contact: boolean;
  customer_id?: string | null;
};

/**
 * Send booking confirmation to every participant that maps to a user account.
 * Guests without a user account are skipped because OneSignal targets users by
 * external user id, not raw email addresses or phone numbers.
 */
export async function sendGroupBookingNotifications(
  supabase: SupabaseClient,
  bookingId: string,
  groupBookingId?: string
): Promise<void> {
  let participants: GroupNotificationParticipant[] = [];

  if (groupBookingId) {
    const groupBooking = await getGroupBooking(supabase, groupBookingId);
    if (groupBooking) {
      participants = groupBooking.participants.map((p) => ({
        participant_name: p.participant_name,
        participant_email: p.participant_email,
        participant_phone: p.participant_phone,
        is_primary_contact: p.is_primary_contact,
        customer_id: p.customer_id,
      }));
    }
  } else {
    const { data: bookingParticipants } = await supabase
      .from('booking_participants')
      .select('participant_name, participant_email, participant_phone, is_primary_contact, customer_id')
      .eq('booking_id', bookingId);

    if (bookingParticipants) {
      participants = bookingParticipants as GroupNotificationParticipant[];
    }
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_number, scheduled_at, provider_id, location_type')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking) return;

  const { data: provider } = await supabase
    .from('providers')
    .select('business_name, slug')
    .eq('id', booking.provider_id)
    .maybeSingle();

  for (const participant of participants) {
    const userId = await resolveParticipantUserId(supabase, participant);
    if (!userId) {
      console.warn('[group booking notifications] participant has no linked user; skipping', {
        email: participant.participant_email,
        phone: participant.participant_phone,
        groupBookingId,
      });
      continue;
    }

    await sendGroupBookingConfirmation(
      userId,
      participant.participant_name,
      booking,
      provider,
      participant.is_primary_contact,
      {
        email: Boolean(participant.participant_email),
        sms: Boolean(participant.participant_phone),
      }
    );
  }
}

async function resolveParticipantUserId(
  supabase: SupabaseClient,
  participant: Pick<
    GroupNotificationParticipant,
    'customer_id' | 'participant_email' | 'participant_phone'
  >
): Promise<string | null> {
  if (participant.customer_id) return participant.customer_id;

  if (participant.participant_email) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', participant.participant_email)
      .maybeSingle();
    if (user?.id) return user.id as string;
  }

  if (participant.participant_phone) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('phone', participant.participant_phone)
      .maybeSingle();
    if (user?.id) return user.id as string;
  }

  return null;
}

async function sendGroupBookingConfirmation(
  userId: string,
  name: string,
  booking: {
    id: string;
    booking_number?: string | null;
    scheduled_at?: string | null;
    location_type?: string | null;
  },
  provider: { business_name?: string | null } | null,
  isPrimary: boolean,
  channels: { email: boolean; sms: boolean }
): Promise<void> {
  const scheduledDate = new Date(booking.scheduled_at || Date.now());
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com';
  const bookingNumber = booking.booking_number || booking.id;

  const title = isPrimary
    ? `Group Booking Confirmation - ${bookingNumber}`
    : `You're Invited to a Group Booking - ${bookingNumber}`;

  const message = `
Hi ${name},

${isPrimary ? 'Your group booking has been confirmed!' : "You've been added to a group booking!"}

Booking Details:
- Booking Number: ${bookingNumber}
- Date & Time: ${dateStr} at ${timeStr}
- Provider: ${provider?.business_name || 'Beautonomi Partner'}
- Location: ${booking.location_type === 'at_salon' ? 'At Salon' : 'At Home'}

${
  isPrimary
    ? 'As the primary contact, you are responsible for this booking. All participants will receive their own confirmation.'
    : 'The primary contact will handle payment and coordination for this group booking.'
}

View your booking:
${appUrl}/account-settings/bookings

Best regards,
Beautonomi Team
  `.trim();

  const deliveryChannels = [
    ...(channels.email ? (['email'] as const) : []),
    ...(channels.sms ? (['sms'] as const) : []),
  ];
  if (deliveryChannels.length === 0) return;

  try {
    await sendToUser(
      userId,
      {
        title,
        message,
        type: 'group_booking_confirmation',
        data: {
          booking_id: booking.id,
          booking_number: booking.booking_number ?? null,
          group_booking: true,
        },
        url: `${appUrl}/account-settings/bookings`,
      },
      deliveryChannels,
      { appType: 'customer' }
    );
  } catch (error) {
    console.warn('Group booking notification failed:', error);
  }
}
