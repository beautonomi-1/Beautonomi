/**
 * Waitlist Notification Service
 * Sends notifications to waitlist entries when slots become available
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { WaitlistMatch } from './matching';
import { format } from 'date-fns';

/**
 * Send notification to waitlist entry about available slots
 */
export async function notifyWaitlistMatch(
  supabase: SupabaseClient,
  match: WaitlistMatch,
  providerSlug?: string
): Promise<void> {
  const { entry, availableSlots, matchReason } = match;

  // Update entry status to 'notified'
  await supabase
    .from('waitlist_entries')
    .update({ 
      status: 'notified',
      notified_at: new Date().toISOString(),
    })
    .eq('id', entry.id);

  // Create notification record
  const bookingUrl = providerSlug 
    ? `/booking?slug=${providerSlug}&serviceId=${entry.service_id || ''}`
    : `/booking`;

  // Format available slots for display
  const slotsText = availableSlots
    .slice(0, 5) // Show top 5 slots
    .map(slot => {
      const date = new Date(slot.date);
      return `${format(date, 'MMM d')} at ${formatTime(slot.time)}`;
    })
    .join(', ');

  const moreSlots = availableSlots.length > 5 ? ` and ${availableSlots.length - 5} more` : '';

  // Store notification in database (if notifications table exists)
  try {
    await supabase.from('notifications').insert({
      user_id: entry.customer_id,
      type: 'waitlist_match',
      title: 'Available Appointment Slots',
      message: `${matchReason}: ${slotsText}${moreSlots}`,
      data: {
        waitlist_entry_id: entry.id,
        available_slots: availableSlots,
        booking_url: bookingUrl,
      },
      read: false,
    });
  } catch (error) {
    // Notifications table might not exist, that's okay
    console.warn('Could not create notification record:', error);
  }

  // Send email notification if email provided
  if (entry.customer_email) {
    try {
      await sendWaitlistEmailNotification(
        String(entry.customer_email),
        String(entry.customer_name ?? ''),
        availableSlots,
        matchReason ?? '',
        bookingUrl
      );
    } catch (error) {
      console.error('Failed to send email notification:', error);
    }
  }

  // Send SMS notification if phone provided (if SMS service is configured)
  if (entry.customer_phone) {
    try {
      await sendWaitlistSMSNotification(
        String(entry.customer_phone),
        String(entry.customer_name ?? ''),
        availableSlots,
        bookingUrl
      );
    } catch (error) {
      console.error('Failed to send SMS notification:', error);
    }
  }
}

/**
 * Send email notification
 */
async function sendWaitlistEmailNotification(
  email: string,
  name: string,
  availableSlots: Array<{ date: string; time: string; staffId?: string | null }>,
  matchReason: string,
  bookingUrl: string
): Promise<void> {
  // Format slots for email
  const slotsList = availableSlots
    .slice(0, 10)
    .map(slot => {
      const date = new Date(slot.date);
      return `  • ${format(date, 'EEEE, MMMM d, yyyy')} at ${formatTime(slot.time)}`;
    })
    .join('\n');

  const subject = 'Available Appointment Slots - Book Now!';
  const body = `
Hi ${name},

Great news! ${matchReason} for your requested service.

Available time slots:
${slotsList}

Book your appointment now:
${process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com'}${bookingUrl}

These slots are available on a first-come, first-served basis, so book soon!

Best regards,
Beautonomi Team
  `.trim();

  // Use OneSignal with template if available, otherwise direct email
  try {
    // Try to use template first
    const { sendTemplateNotification } = await import('@/lib/notifications/onesignal');
    const { getSupabaseServer } = await import('@/lib/supabase/server');
    const supabase = await getSupabaseServer();
    
    // Get user ID from email
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (user?.id) {
      // Try to use waitlist_match template
      const result = await sendTemplateNotification(
        'waitlist_match',
        [user.id],
        {
          customer_name: name,
          match_reason: matchReason,
          slots_list: slotsList,
          booking_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com'}${bookingUrl}`,
        },
        ['email']
      );

      if (result.success) {
        return; // Template notification sent successfully
      }
    }

    // Fallback to direct email
    await fetch('/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject,
        body,
        type: 'waitlist_match',
        userId: user?.id,
      }),
    });
  } catch (error) {
    // If email endpoint doesn't exist, log and continue
    console.warn('Email notification endpoint not available:', error);
  }
}

/**
 * Send SMS notification
 */
async function sendWaitlistSMSNotification(
  phone: string,
  name: string,
  availableSlots: Array<{ date: string; time: string; staffId?: string | null }>,
  bookingUrl: string
): Promise<void> {
  const firstSlot = availableSlots[0];
  const date = new Date(firstSlot.date);
  const slotText = `${format(date, 'MMM d')} at ${formatTime(firstSlot.time)}`;
  const moreText = availableSlots.length > 1 ? ` and ${availableSlots.length - 1} more` : '';

  const message = `Hi ${name}! Available appointment slots: ${slotText}${moreText}. Book now: ${process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com'}${bookingUrl}`;

  // Use OneSignal with template if available, otherwise direct SMS
  try {
    // Try to use template first
    const { sendTemplateNotification } = await import('@/lib/notifications/onesignal');
    const { getSupabaseServer } = await import('@/lib/supabase/server');
    const supabase = await getSupabaseServer();
    
    // Get user ID from phone
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .single();

    if (user?.id) {
      // Try to use waitlist_match template
      const result = await sendTemplateNotification(
        'waitlist_match_sms',
        [user.id],
        {
          customer_name: name,
          slot_text: slotText,
          more_text: moreText,
          booking_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://beautonomi.com'}${bookingUrl}`,
        },
        ['sms']
      );

      if (result.success) {
        return; // Template notification sent successfully
      }
    }

    // Fallback to direct SMS
    await fetch('/api/notifications/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        message,
        type: 'waitlist_match',
        userId: user?.id,
      }),
    });
  } catch (error) {
    // If SMS endpoint doesn't exist, log and continue
    console.warn('SMS notification endpoint not available:', error);
  }
}

/**
 * Format time from HH:MM to readable format
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}
