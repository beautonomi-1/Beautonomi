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
    cancellationReason?: string | null;
    feeRetained?: number;
    walletRefund?: number;
    currency?: string;
  } = {}
): Promise<void> {
  try {
    const {
      cancelledBy = 'customer',
      refundInfo = 'No refund applicable',
      cancellationReason,
      feeRetained,
      walletRefund,
      currency,
    } = options;
    await notifyBookingCancelled(bookingId, cancelledBy, refundInfo, ['email', 'push'], {
      cancellationReason,
      feeRetained,
      walletRefund,
      currency,
    });
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
 * Resolves total service duration from booking_services (not the bookings row).
 */
export async function sendServiceStartedNotification(bookingId: string): Promise<void> {
  try {
    const {
      resolveBookingServiceDurationMinutes,
      formatServiceDurationForNotification,
    } = await import("@/lib/bookings/resolve-booking-service-duration");
    const minutes = await resolveBookingServiceDurationMinutes(bookingId);
    const durationLabel = formatServiceDurationForNotification(minutes);
    await notifyServiceStarted(bookingId, durationLabel, ["email", "push"]);
  } catch (error) {
    console.error("Failed to send service-started notification:", error);
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
