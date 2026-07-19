/**
 * Fallback copy when a must-deliver template row is missing/disabled.
 * Ensures transactional pushes still reach devices (same transport as broadcasts).
 */
import { finalizeServiceStartedNotificationBody } from "@/lib/bookings/resolve-booking-service-duration";

const FALLBACK_BY_KEY: Record<string, { title: string; body: string; url?: string }> = {
  booking_confirmed: {
    title: "Booking confirmed",
    body: "Your appointment with {{provider_name}} is confirmed for {{booking_date}} at {{booking_time}}.",
    url: "/bookings/{{booking_id}}",
  },
  booking_reminder_24h: {
    title: "Appointment reminder",
    body: "Reminder: you have an appointment with {{provider_name}} tomorrow.",
    url: "/bookings/{{booking_id}}",
  },
  booking_reminder_2h: {
    title: "Appointment soon",
    body: "Your appointment with {{provider_name}} is in 2 hours.",
    url: "/bookings/{{booking_id}}",
  },
  booking_cancelled: {
    title: "Booking cancelled",
    body: "Your booking {{booking_number}} has been cancelled.",
    url: "/bookings/{{booking_id}}",
  },
  booking_rescheduled: {
    title: "Booking rescheduled",
    body: "Your appointment has been moved to {{booking_date}} at {{booking_time}}.",
    url: "/bookings/{{booking_id}}",
  },
  customer_new_message: {
    title: "New message",
    body: "{{provider_name}}: {{message_preview}}",
    url: "/account-settings/messages?conversation={{conversation_id}}",
  },
  provider_new_message: {
    title: "New message",
    body: "{{sender_name}}: {{message_preview}}",
    url: "/provider/messaging?conversation={{conversation_id}}",
  },
  new_message: {
    title: "New message",
    body: "You have a new message.",
    url: "/account-settings/messages",
  },
  payment_successful: {
    title: "Payment successful",
    body: "Your payment was processed successfully.",
    url: "/account-settings/bookings",
  },
  provider_payment_received: {
    title: "Payment received",
    body: "Payment received: {{amount}} for booking #{{booking_number}} from {{customer_name}}.",
    url: "/provider/bookings/{{booking_id}}",
  },
  cash_refund_confirmation: {
    title: "Confirm cash refund",
    body: "{{provider_name}} recorded a {{amount}} cash refund for booking #{{booking_number}}. Tap to confirm or dispute.",
    url: "/account-settings/bookings/{{booking_id}}?refund_confirm={{refund_id}}",
  },
  walk_in_app_nudge: {
    title: "Manage your bookings on Beautonomi",
    body: "Create your free account to view bookings with {{provider_name}} and earn rewards.",
    url: "{{claim_link}}",
  },
  payment_failed: {
    title: "Payment failed",
    body: "Your payment could not be processed. Please try again.",
    url: "/account-settings/bookings",
  },
  provider_booking_request: {
    title: "New booking",
    body: "You have a new booking request from {{customer_name}}.",
    url: "/provider/bookings/{{booking_id}}",
  },
  new_booking: {
    title: "New booking",
    body: "You have a new booking.",
    url: "/provider/bookings/{{booking_id}}",
  },
  provider_en_route_home: {
    title: "Provider On The Way",
    body: "{{provider_name}} is on the way to your location.",
    url: "/bookings/{{booking_id}}",
  },
  provider_arrived_home: {
    title: "Provider Has Arrived",
    body: "{{provider_name}} has arrived at your location. {{verification_hint}}",
    url: "/bookings/{{booking_id}}",
  },
  service_started: {
    title: "Service Started",
    body: "Your service with {{provider_name}} has started. Estimated duration: {{service_duration}}.",
    url: "/bookings/{{booking_id}}",
  },
  service_completed: {
    title: "Service Completed",
    body: "Your service with {{provider_name}} has been completed. Thank you for choosing Beautonomi!",
    url: "/bookings/{{booking_id}}/review",
  },
};

function substituteAll(template: string, variables: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return out;
}

export type MustDeliverFallbackContent = {
  title: string;
  body: string;
  url: string;
  channels: ("push" | "email" | "sms")[];
};

export function buildMustDeliverFallback(
  templateKey: string,
  variables: Record<string, string>,
  options?: {
    fallbackTitle?: string;
    fallbackBody?: string;
    fallbackUrl?: string;
  },
): MustDeliverFallbackContent | null {
  const key = templateKey.trim();
  const preset = FALLBACK_BY_KEY[key];
  const titleTemplate = options?.fallbackTitle ?? preset?.title ?? "Notification";
  const bodyTemplate =
    options?.fallbackBody ?? preset?.body ?? "You have a new update on Beautonomi.";
  const urlTemplate = options?.fallbackUrl ?? preset?.url ?? "";

  return {
    title: substituteAll(titleTemplate, variables),
    body:
      key === "service_started"
        ? finalizeServiceStartedNotificationBody(
            substituteAll(bodyTemplate, variables),
            variables.service_duration ?? "",
          )
        : substituteAll(bodyTemplate, variables),
    url: urlTemplate ? substituteAll(urlTemplate, variables) : "",
    channels: ["push"],
  };
}
