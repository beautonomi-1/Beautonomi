/**
 * Booking Notification Helpers
 * Wrapper functions for sending notifications on booking events
 */

import { 
  notifyBookingCancelled,
  notifyBookingRescheduled,
  notifyBookingConfirmed,
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
