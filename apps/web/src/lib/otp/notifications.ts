/**
 * OTP Notification Service
 *
 * Notifies customer when provider has arrived. PIN is shown only in-app (booking detail);
 * no SMS or email to save cost.
 */

import { sendToUser } from "@/lib/notifications/onesignal";

interface SendOTPOptions {
  customerId: string;
  phone: string;
  email: string;
  otp: string;
  /** Booking UUID for deep link to booking detail */
  bookingId: string;
  bookingNumber: string;
  providerName: string;
  customerName: string;
}

/**
 * Notify customer that provider has arrived. Push only – PIN is shown in-app when they open the booking.
 * No SMS or email (cost saving).
 */
export async function sendOTPToCustomer(options: SendOTPOptions): Promise<void> {
  const { customerId, bookingNumber, providerName, bookingId } = options;

  const message = `${providerName} has arrived. Open the app to see your verification code for booking #${bookingNumber}.`;

  try {
    await sendToUser(
      customerId,
      {
        title: "Provider Arrived",
        message,
        type: "provider_arrived",
        bookingId: bookingNumber,
        data: {
          type: "provider_arrived",
          booking_id: bookingId,
          booking_number: bookingNumber,
          provider_name: providerName,
        },
      },
      ["push"],
      { appType: "customer" }
    );
  } catch (error) {
    console.error("Error sending arrival notification:", error);
  }
}


/**
 * Notify customer that the provider reported arrival WITHOUT the customer's
 * verification code (manual override). Transparency + dispute-safety: the
 * customer is told an override happened so they can flag it if it's wrong.
 */
export async function sendArrivalOverrideNotification(
  customerId: string,
  bookingNumber: string,
  providerName: string,
  bookingId: string,
): Promise<void> {
  try {
    await sendToUser(
      customerId,
      {
        title: "Arrival reported",
        message: `${providerName} reported arrival for booking #${bookingNumber} without your verification code. If this isn't right, please contact support.`,
        type: "arrival_overridden",
        bookingId: bookingNumber,
        data: {
          type: "arrival_overridden",
          booking_id: bookingId,
          booking_number: bookingNumber,
          provider_name: providerName,
        },
      },
      ["push"],
      { appType: "customer" },
    );
  } catch (error) {
    console.error("Error sending arrival override notification:", error);
  }
}

