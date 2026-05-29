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
import { resolveTwilioCredentials, sendTwilioSMS } from '@/lib/integrations/twilio';

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
    const channels = {
      email: Boolean(participant.participant_email),
      sms: Boolean(participant.participant_phone),
    };

    if (userId) {
      await sendGroupBookingConfirmation(
        userId,
        participant.participant_name,
        booking,
        provider,
        participant.is_primary_contact,
        channels,
        groupBookingId,
      );
      continue;
    }

    await sendWalkInGroupBookingConfirmation(
      supabase,
      participant,
      booking,
      provider,
      channels,
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

function buildGroupConfirmationCopy(
  name: string,
  booking: {
    id: string;
    booking_number?: string | null;
    scheduled_at?: string | null;
    location_type?: string | null;
  },
  provider: { business_name?: string | null } | null,
  isPrimary: boolean,
): { title: string; message: string } {
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

  return { title, message };
}

async function sendWalkInEmail(to: string, subject: string, body: string): Promise<void> {
  const providerKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.EMAIL_PROVIDER_API_KEY?.trim() ||
    '';
  if (!providerKey) {
    console.warn('[group booking notifications] email provider not configured; skipping walk-in email');
    return;
  }
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'Beautonomi <notifications@beautonomi.app>';
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to,
      subject,
      text: body,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.warn('[group booking notifications] walk-in email failed', resp.status, text.slice(0, 200));
  }
}

async function sendWalkInGroupBookingConfirmation(
  supabase: SupabaseClient,
  participant: GroupNotificationParticipant,
  booking: {
    id: string;
    booking_number?: string | null;
    scheduled_at?: string | null;
    location_type?: string | null;
    provider_id?: string | null;
  },
  provider: { business_name?: string | null } | null,
  channels: { email: boolean; sms: boolean },
): Promise<void> {
  const { title, message } = buildGroupConfirmationCopy(
    participant.participant_name,
    booking,
    provider,
    participant.is_primary_contact,
  );

  if (channels.email && participant.participant_email) {
    try {
      await sendWalkInEmail(participant.participant_email, title, message);
    } catch (error) {
      console.warn('[group booking notifications] walk-in email error:', error);
    }
  }

  if (channels.sms && participant.participant_phone && booking.provider_id) {
    try {
      const { data: providerRow } = await supabase
        .from('providers')
        .select('tenant_id')
        .eq('id', booking.provider_id)
        .maybeSingle();
      const tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id;
      if (!tenantId) {
        console.warn('[group booking notifications] provider tenant missing; skipping walk-in SMS');
      } else {
        const creds = await resolveTwilioCredentials(supabase, tenantId);
        if (creds?.smsFrom) {
          await sendTwilioSMS(creds, participant.participant_phone, message);
        } else {
          console.warn('[group booking notifications] SMS not configured; skipping walk-in SMS');
        }
      }
    } catch (error) {
      console.warn('[group booking notifications] walk-in SMS error:', error);
    }
  }

  if (!channels.email && !channels.sms) {
    console.warn('[group booking notifications] walk-in participant has no contact channels', {
      email: participant.participant_email,
      phone: participant.participant_phone,
    });
  }
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
  channels: { email: boolean; sms: boolean },
  groupBookingId?: string | null
): Promise<void> {
  const { title, message } = buildGroupConfirmationCopy(
    name,
    booking,
    provider,
    isPrimary,
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com';

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
          group_booking_id: groupBookingId ?? null,
        },
        url: groupBookingId
          ? `${appUrl}/account-settings/bookings?group_booking_id=${groupBookingId}`
          : `${appUrl}/account-settings/bookings`,
      },
      deliveryChannels,
      { appType: 'customer' }
    );
  } catch (error) {
    console.warn('Group booking notification failed:', error);
  }
}
