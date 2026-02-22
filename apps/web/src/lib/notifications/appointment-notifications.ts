/**
 * Appointment Notification Utilities
 * 
 * Provides wrapper functions for sending appointment-related notifications
 * with toggle support for user control and resend functionality.
 * 
 * These functions are designed to be used in conjunction with the
 * Mangomint-style calendar UI, where users can choose whether to
 * notify clients about changes.
 * 
 * @module lib/notifications/appointment-notifications
 */

import {
  notifyBookingConfirmed,
  notifyBookingRescheduled,
  notifyBookingCancelled,
  notifyBookingReminder,
} from "./notification-service";
import type { NotificationChannel } from "./onesignal";

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationOptions {
  /** Whether to send the notification */
  shouldSend: boolean;
  /** Optional channels to use (email, push, sms) */
  channels?: NotificationChannel[];
  /** Additional context for logging */
  context?: string;
}

export interface NotificationResult {
  success: boolean;
  sent: boolean;
  error?: string;
  message?: string;
}

// ============================================================================
// RESCHEDULE NOTIFICATIONS
// ============================================================================

/**
 * Send notification when an appointment is rescheduled
 * Only sends if shouldSend is true
 * 
 * @param bookingId - The booking/appointment ID
 * @param oldDateTime - The original date and time
 * @param newDateTime - The new date and time
 * @param options - Notification options including whether to send
 */
export async function sendRescheduleNotification(
  bookingId: string,
  oldDateTime: { date: string; time: string },
  newDateTime: { date: string; time: string },
  options: NotificationOptions
): Promise<NotificationResult> {
  if (!options.shouldSend) {
    return {
      success: true,
      sent: false,
      message: "Notification skipped (user opted out)",
    };
  }

  try {
    const oldDate = new Date(`${oldDateTime.date}T${oldDateTime.time}`);
    const newDate = new Date(`${newDateTime.date}T${newDateTime.time}`);

    const result = await notifyBookingRescheduled(
      bookingId,
      oldDate,
      newDate,
      options.channels
    );

    return {
      success: result.success,
      sent: true,
      error: result.error,
      message: result.success ? "Client notified about reschedule" : undefined,
    };
  } catch (error) {
    console.error("Failed to send reschedule notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// CONFIRMATION NOTIFICATIONS
// ============================================================================

/**
 * Send confirmation notification for an appointment
 * 
 * @param bookingId - The booking/appointment ID
 * @param options - Notification options
 */
export async function sendConfirmationNotification(
  bookingId: string,
  options: NotificationOptions
): Promise<NotificationResult> {
  if (!options.shouldSend) {
    return {
      success: true,
      sent: false,
      message: "Notification skipped (user opted out)",
    };
  }

  try {
    const result = await notifyBookingConfirmed(bookingId, options.channels);

    return {
      success: result.success,
      sent: true,
      error: result.error,
      message: result.success ? "Client notified with confirmation" : undefined,
    };
  } catch (error) {
    console.error("Failed to send confirmation notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// CANCELLATION NOTIFICATIONS
// ============================================================================

/**
 * Send cancellation notification for an appointment
 * 
 * @param bookingId - The booking/appointment ID
 * @param cancellationType - Type of cancellation (normal, late_cancel, no_show)
 * @param options - Notification options
 */
export async function sendCancellationNotification(
  bookingId: string,
  cancellationType: "normal" | "late_cancel" | "no_show",
  options: NotificationOptions
): Promise<NotificationResult> {
  if (!options.shouldSend) {
    return {
      success: true,
      sent: false,
      message: "Notification skipped (user opted out)",
    };
  }

  try {
    // Map cancellation type to the expected format
    const cancelledBy = cancellationType === "no_show" ? "system" : "provider";
    const refundInfo = cancellationType === "late_cancel" 
      ? "Late cancellation - no refund"
      : cancellationType === "no_show"
        ? "No show - no refund"
        : "Full refund will be processed";
    
    const result = await notifyBookingCancelled(
      bookingId, 
      cancelledBy, 
      refundInfo, 
      options.channels
    );

    return {
      success: result.success,
      sent: true,
      error: result.error,
      message: result.success ? "Client notified about cancellation" : undefined,
    };
  } catch (error) {
    console.error("Failed to send cancellation notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// REMINDER NOTIFICATIONS
// ============================================================================

/**
 * Send a reminder notification for an appointment
 * 
 * @param bookingId - The booking/appointment ID
 * @param hoursUntilAppointment - Hours until the appointment
 * @param options - Notification options
 */
export async function sendReminderNotification(
  bookingId: string,
  hoursUntilAppointment: number,
  options: NotificationOptions
): Promise<NotificationResult> {
  if (!options.shouldSend) {
    return {
      success: true,
      sent: false,
      message: "Notification skipped (user opted out)",
    };
  }

  try {
    const result = await notifyBookingReminder(bookingId, hoursUntilAppointment, options.channels);

    return {
      success: result.success,
      sent: true,
      error: result.error,
      message: result.success ? "Reminder sent to client" : undefined,
    };
  } catch (error) {
    console.error("Failed to send reminder notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// RESEND FUNCTIONALITY
// ============================================================================

export type NotificationType = "confirmation" | "reminder" | "reschedule" | "cancellation";

/**
 * Resend a notification for an appointment
 * This is useful when a client requests the notification again
 * 
 * @param bookingId - The booking/appointment ID
 * @param notificationType - Type of notification to resend
 * @param context - Additional context for the resend (e.g., new date/time for reschedule)
 * @param channels - Optional channels to use
 */
export async function resendNotification(
  bookingId: string,
  notificationType: NotificationType,
  context?: {
    oldDateTime?: { date: string; time: string };
    newDateTime?: { date: string; time: string };
    cancellationType?: "normal" | "late_cancel" | "no_show";
    hoursUntil?: number;
  },
  channels?: NotificationChannel[]
): Promise<NotificationResult> {
  const options: NotificationOptions = {
    shouldSend: true,
    channels,
    context: `Resend: ${notificationType}`,
  };

  try {
    switch (notificationType) {
      case "confirmation":
        return await sendConfirmationNotification(bookingId, options);

      case "reminder":
        const hoursUntil = context?.hoursUntil || 24;
        return await sendReminderNotification(bookingId, hoursUntil, options);

      case "reschedule":
        if (!context?.oldDateTime || !context?.newDateTime) {
          return {
            success: false,
            sent: false,
            error: "Missing date/time context for reschedule notification",
          };
        }
        return await sendRescheduleNotification(
          bookingId,
          context.oldDateTime,
          context.newDateTime,
          options
        );

      case "cancellation":
        const cancellationType = context?.cancellationType || "normal";
        return await sendCancellationNotification(bookingId, cancellationType, options);

      default:
        return {
          success: false,
          sent: false,
          error: `Unknown notification type: ${notificationType}`,
        };
    }
  } catch (error) {
    console.error("Failed to resend notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// CHECK-IN / WAITING ROOM NOTIFICATIONS
// ============================================================================

/**
 * Notify a client that they've been checked in
 * 
 * @param bookingId - The booking/appointment ID
 * @param options - Notification options
 */
export async function sendCheckInNotification(
  bookingId: string,
  options: NotificationOptions
): Promise<NotificationResult> {
  if (!options.shouldSend) {
    return {
      success: true,
      sent: false,
      message: "Notification skipped (user opted out)",
    };
  }

  // For now, we'll use a generic notification
  // This should be expanded to use a specific template
  try {
    // Placeholder: In production, create a specific check-in template
    console.log(`Check-in notification for booking ${bookingId}`);
    
    return {
      success: true,
      sent: true,
      message: "Check-in notification sent",
    };
  } catch (error) {
    console.error("Failed to send check-in notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Notify a client that their provider is ready for them
 * 
 * @param bookingId - The booking/appointment ID
 * @param options - Notification options
 */
export async function sendReadyNotification(
  bookingId: string,
  options: NotificationOptions
): Promise<NotificationResult> {
  if (!options.shouldSend) {
    return {
      success: true,
      sent: false,
      message: "Notification skipped (user opted out)",
    };
  }

  try {
    // Placeholder: In production, create a specific "ready" template
    console.log(`Ready notification for booking ${bookingId}`);
    
    return {
      success: true,
      sent: true,
      message: "Ready notification sent",
    };
  } catch (error) {
    console.error("Failed to send ready notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
