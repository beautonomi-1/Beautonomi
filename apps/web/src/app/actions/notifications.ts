"use server";

/**
 * Server Actions for Notifications
 * 
 * These actions handle notification-related operations that require
 * server-side execution (accessing cookies, database, etc.)
 */

import {
  sendRescheduleNotification,
  sendConfirmationNotification,
  sendCancellationNotification,
  sendReminderNotification,
  resendNotification,
  type NotificationResult,
  type NotificationType,
} from "@/lib/notifications/appointment-notifications";
import type { NotificationChannel } from "@/lib/notifications/onesignal";

/**
 * Server action to resend a notification
 */
export async function resendAppointmentNotification(
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
  try {
    return await resendNotification(bookingId, notificationType, context, channels);
  } catch (error) {
    console.error("Server action: Failed to resend notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Server action to send reschedule notification
 */
export async function sendRescheduleNotificationAction(
  bookingId: string,
  oldDateTime: { date: string; time: string },
  newDateTime: { date: string; time: string },
  shouldSend: boolean,
  channels?: NotificationChannel[]
): Promise<NotificationResult> {
  try {
    return await sendRescheduleNotification(bookingId, oldDateTime, newDateTime, {
      shouldSend,
      channels,
    });
  } catch (error) {
    console.error("Server action: Failed to send reschedule notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Server action to send confirmation notification
 */
export async function sendConfirmationNotificationAction(
  bookingId: string,
  shouldSend: boolean,
  channels?: NotificationChannel[]
): Promise<NotificationResult> {
  try {
    return await sendConfirmationNotification(bookingId, {
      shouldSend,
      channels,
    });
  } catch (error) {
    console.error("Server action: Failed to send confirmation notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Server action to send cancellation notification
 */
export async function sendCancellationNotificationAction(
  bookingId: string,
  cancellationType: "normal" | "late_cancel" | "no_show",
  shouldSend: boolean,
  channels?: NotificationChannel[]
): Promise<NotificationResult> {
  try {
    return await sendCancellationNotification(bookingId, cancellationType, {
      shouldSend,
      channels,
    });
  } catch (error) {
    console.error("Server action: Failed to send cancellation notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Server action to send reminder notification
 */
export async function sendReminderNotificationAction(
  bookingId: string,
  hoursUntilAppointment: number,
  shouldSend: boolean,
  channels?: NotificationChannel[]
): Promise<NotificationResult> {
  try {
    return await sendReminderNotification(bookingId, hoursUntilAppointment, {
      shouldSend,
      channels,
    });
  } catch (error) {
    console.error("Server action: Failed to send reminder notification:", error);
    return {
      success: false,
      sent: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
