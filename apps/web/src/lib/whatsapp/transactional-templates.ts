/**
 * WhatsApp templates that may send without marketing opt-in (STOP still wins).
 */
const CUSTOMER_TRANSACTIONAL = new Set([
  "booking_confirmed",
  "booking_cancelled",
  "booking_rescheduled",
  "booking_reminder_24h",
  "booking_reminder_2h",
  "appointment_reminder",
  "guest_booking_link",
  "guest_arrival_verification",
  "payment_pending",
  "additional_charge_requested",
  "provider_en_route_home",
  "provider_arriving_soon_home",
  "provider_arrived_home",
  "salon_directions",
  "service_completed",
  "review_reminder",
  "rebook_reminder",
  "loyalty_points_earned",
  "post_visit_whatsapp",
  "walk_in_app_nudge",
  "account_claim_invite",
  "payment_received",
  "receipt_sent",
]);

const PROVIDER_TRANSACTIONAL = new Set([
  "provider_booking_request",
  "provider_booking_cancelled",
  "provider_booking_rescheduled",
  "provider_customer_running_late",
  "provider_payout_processed",
  "provider_payout_failed",
  "provider_payout_scheduled",
  "provider_new_review",
]);

export function isTransactionalWhatsAppTemplate(
  templateKey: string,
  appType?: "customer" | "provider" | null,
): boolean {
  const key = templateKey.trim().toLowerCase();
  if (appType === "provider") return PROVIDER_TRANSACTIONAL.has(key);
  if (appType === "customer") return CUSTOMER_TRANSACTIONAL.has(key);
  return CUSTOMER_TRANSACTIONAL.has(key) || PROVIDER_TRANSACTIONAL.has(key);
}

export function isFirstTouchWhatsAppTemplate(templateKey: string): boolean {
  const key = templateKey.trim().toLowerCase();
  return (
    key === "booking_confirmed" ||
    key === "guest_booking_link" ||
    key === "guest_arrival_verification" ||
    key === "account_claim_invite" ||
    key.startsWith("provider_") ||
    key === "payment_pending"
  );
}
