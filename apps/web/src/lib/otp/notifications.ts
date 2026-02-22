/**
 * OTP Notification Service
 * 
 * Sends OTP codes to customers via SMS and Email
 */

import { sendToUser } from "@/lib/notifications/onesignal";

interface SendOTPOptions {
  customerId: string;
  phone: string;
  email: string;
  otp: string;
  bookingNumber: string;
  providerName: string;
  customerName: string;
}

/**
 * Send OTP to customer via SMS and Email
 */
export async function sendOTPToCustomer(options: SendOTPOptions): Promise<void> {
  const { customerId, phone: _phone, email: _email, otp, bookingNumber, providerName, customerName } = options;

  const message = `Your Beautonomi arrival verification code is ${otp}. Valid for 10 minutes. Booking #${bookingNumber}. ${providerName} has arrived at your location.`;

  // Send via OneSignal (Push, SMS, and Email)
  try {
    const _emailBody = `
      <h2>Provider Arrived</h2>
      <p>Hello ${customerName},</p>
      <p>${providerName} has arrived at your location for booking #${bookingNumber}.</p>
      <p><strong style="font-size: 24px; letter-spacing: 4px;">Your verification code is: ${otp}</strong></p>
      <p>This code is valid for 10 minutes. Please enter it in the app to confirm the provider's arrival.</p>
      <p>If you didn't request this service, please contact support immediately.</p>
    `;

    await sendToUser(
      customerId,
      {
        title: "Provider Arrived - Verification Required",
        message: message,
        type: "provider_arrived",
        bookingId: bookingNumber,
        data: {
          type: "provider_arrived",
          booking_number: bookingNumber,
          otp: otp,
          provider_name: providerName,
        },
      },
      ["push", "email", "sms"] // Send via all channels
    );

    // Note: Email body formatting is handled by OneSignal template or can be customized
    // The email_body field in sendToUser uses the message field by default
  } catch (error) {
    console.error("Error sending OTP notification:", error);
    // Don't throw - OTP is still generated and stored
    // Provider can manually share OTP if notification fails
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
      ["push", "email"] // Push and email notifications
    );
  } catch (error) {
    console.error("Error sending provider on way notification:", error);
  }
}
