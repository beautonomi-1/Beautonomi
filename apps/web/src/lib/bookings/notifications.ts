/**
 * Booking Notification Helpers
 * Wrapper functions for sending notifications on booking events
 */

import { 
  notifyBookingCancelled,
  notifyBookingRescheduled,
  notifyBookingConfirmed,
  notifyServiceStarted,
  notifyServiceCompleted,
} from '@/lib/notifications/notification-service';

/**
 * Send cancellation notification
 * Handles errors gracefully (doesn't throw)
 */
export async function sendCancellationNotification(
  bookingId: string,
  options: {
    cancelledBy?: 'customer' | 'provider' | 'system';
    refundInfo?: string;
  } = {}
): Promise<void> {
  try {
    const { cancelledBy = 'customer', refundInfo = 'No refund applicable' } = options;
    await notifyBookingCancelled(bookingId, cancelledBy, refundInfo, ['email', 'push']);
  } catch (error) {
    // Log but don't throw - notification failure shouldn't break booking cancellation
    console.error('Failed to send cancellation notification:', error);
  }
}

/**
 * Send reschedule notification
 * Handles errors gracefully (doesn't throw)
 */
export async function sendRescheduleNotification(
  bookingId: string,
  oldDatetime: Date,
  newDatetime: Date
): Promise<void> {
  try {
    await notifyBookingRescheduled(bookingId, oldDatetime, newDatetime, ['email', 'push']);
  } catch (error) {
    // Log but don't throw - notification failure shouldn't break rescheduling
    console.error('Failed to send reschedule notification:', error);
  }
}

/**
 * Send booking confirmation notification
 * Handles errors gracefully (doesn't throw)
 */
export async function sendBookingConfirmationNotification(
  bookingId: string
): Promise<void> {
  try {
    await notifyBookingConfirmed(bookingId, ['email', 'push']);
  } catch (error) {
    // Log but don't throw - notification failure shouldn't break booking creation
    console.error('Failed to send booking confirmation notification:', error);
  }
}

/**
 * Send "service started" notification to the customer (push + email).
 *
 * §Release-audit 2026-04: the provider's start-service / PATCH→in_progress
 * paths were previously silent on the customer side. Customers could not
 * tell from the app that their appointment had begun. This wrapper funnels
 * every start-service code path through a single helper so parity between
 * the generic PATCH route, the dedicated /start-service endpoint, and the
 * front-desk UI is guaranteed.
 *
 * `serviceDurationMinutes` is optional — when omitted we pass an empty
 * string and the template renders without the duration placeholder.
 */
export async function sendServiceStartedNotification(
  bookingId: string,
  serviceDurationMinutes?: number | null,
): Promise<void> {
  try {
    const mins =
      typeof serviceDurationMinutes === 'number' && serviceDurationMinutes > 0
        ? `${serviceDurationMinutes} min`
        : '';
    await notifyServiceStarted(bookingId, mins, ['email', 'push']);
  } catch (error) {
    console.error('Failed to send service-started notification:', error);
  }
}

/**
 * Send "service completed" notification to the customer (push + email).
 *
 * §Release-audit 2026-04: pair to {@link sendServiceStartedNotification}.
 * Ensures the customer learns the service has ended and the review/receipt
 * flow can start, regardless of which provider surface marked completion.
 */
export async function sendServiceCompletedNotification(
  bookingId: string,
): Promise<void> {
  try {
    await notifyServiceCompleted(bookingId, ['email', 'push']);
  } catch (error) {
    console.error('Failed to send service-completed notification:', error);
  }
}
