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
  notifyCustomerArrivedSalon,
  notifyWaitingArea,
} from "./notification-service";
import type { NotificationChannel, SendNotificationResult } from "./onesignal";

/** True when template pipeline actually dispatched an external channel (not suppressed by prefs / quiet hours / empty channels). */
function sentFromTemplateResult(result: SendNotificationResult): boolean {
  if (!result.success) return false;
  if (result.notification_id === "suppressed-quiet-hours") return false;
  const msg = result.message ?? "";
  if (msg.includes("No external channels enabled")) return false;
  return true;
}

function messageFromTemplateResult(
  result: SendNotificationResult,
  sentMessage: string,
  fallbackMessage: string,
): string {
  if (sentFromTemplateResult(result)) return sentMessage;
  if (result.error) return result.error;
  if (result.message) return result.message;
  if (result.notification_id === "suppressed-quiet-hours") {
    return "Customer quiet hours are active, so external channels were suppressed.";
  }
  return fallbackMessage;
}

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
      sent: sentFromTemplateResult(result),
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
      sent: sentFromTemplateResult(result),
      error: result.error,
      message: messageFromTemplateResult(
        result,
        "Client notified with confirmation",
        "Confirmation could not be delivered through external channels.",
      ),
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
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();
    const { data: bookingRow } = await admin
      .from("bookings")
      .select("cancellation_fee, total_refunded, total_paid, currency")
      .eq("id", bookingId)
      .maybeSingle();

    const feeRetained = Number((bookingRow as { cancellation_fee?: number } | null)?.cancellation_fee ?? 0);
    const walletRefund = Math.max(
      0,
      Number((bookingRow as { total_refunded?: number } | null)?.total_refunded ?? 0),
    );
    const bookingCurrencyCode = (bookingRow as { currency?: string } | null)?.currency;

    const cancelledBy = cancellationType === "no_show" ? "system" : "provider";
    let refundInfo = "Settlement follows the booking cancellation policy.";
    if (cancellationType === "no_show") {
      refundInfo =
        feeRetained > 0
          ? `Marked as no-show. A no-show fee of ${feeRetained.toFixed(2)} was retained; any remainder was credited to the customer's Beautonomi wallet.`
          : "Marked as no-show. Amounts paid were credited to the customer's Beautonomi wallet.";
    } else if (feeRetained > 0 && walletRefund > 0) {
      refundInfo = `Cancellation fee retained: ${feeRetained.toFixed(2)}. Wallet refund issued: ${walletRefund.toFixed(2)}.`;
    } else if (walletRefund > 0) {
      refundInfo = `A wallet refund of ${walletRefund.toFixed(2)} has been credited to the customer's Beautonomi wallet.`;
    } else if (feeRetained > 0) {
      refundInfo = `A cancellation fee of ${feeRetained.toFixed(2)} was retained per the provider policy.`;
    } else {
      refundInfo = "No amounts were collected on this booking.";
    }

    const result = await notifyBookingCancelled(
      bookingId,
      cancelledBy,
      refundInfo,
      options.channels,
      {
        feeRetained,
        walletRefund,
        currency: bookingCurrencyCode,
      },
    );

    return {
      success: result.success,
      sent: sentFromTemplateResult(result),
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
      sent: sentFromTemplateResult(result),
      error: result.error,
      message: messageFromTemplateResult(
        result,
        "Reminder sent to client",
        "Reminder could not be delivered through external channels.",
      ),
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
 * Notify a client that they've been checked in.
 *
 * §Notifications-audit 2026-05: this used to console.log and return
 * `{success:true, sent:true}` without ever sending a real notification —
 * a textbook silent fake. Now wired to the existing `customer_arrived_salon`
 * template so the customer actually gets a push.
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

  try {
    const result = await notifyCustomerArrivedSalon(bookingId, options.channels);
    return {
      success: result.success,
      sent: sentFromTemplateResult(result),
      error: result.error,
      message: result.success ? "Check-in confirmation sent" : undefined,
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
 * Notify a client that their provider is ready for them.
 *
 * §Notifications-audit 2026-05: previously a silent fake (see above). Now
 * wired to the `salon_waiting_area` template which already has push +
 * in-app coverage.
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
    const result = await notifyWaitingArea(bookingId, "your waiting area", options.channels);
    return {
      success: result.success,
      sent: sentFromTemplateResult(result),
      error: result.error,
      message: result.success ? "Ready notification sent" : undefined,
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
