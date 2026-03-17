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
 * Send notification when provider starts journey
 */
export async function sendProviderOnWayNotification(
  customerId: string,
  bookingNumber: string,
  providerName: string,
  estimatedArrival?: string
): Promise<void> {
  try {
    await sendToUser(
      customerId,
      {
        title: "Provider On The Way",
        message: `${providerName} has started their journey to your location for booking #${bookingNumber}.${estimatedArrival ? ` Estimated arrival: ${estimatedArrival}` : ''}`,
        type: "provider_on_way",
        bookingId: bookingNumber,
        data: {
          type: "provider_on_way",
          booking_number: bookingNumber,
          provider_name: providerName,
          estimated_arrival: estimatedArrival,
        },
      },
      ["push", "email"],
      { appType: "customer" }
    );
  } catch (error) {
    console.error("Error sending provider on way notification:", error);
  }
}
