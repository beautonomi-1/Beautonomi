/**
 * Canonical inventory of what the provider activity feed includes and excludes.
 * Keep in sync with `build-provider-activity-feed.ts`.
 */

export const PROVIDER_ACTIVITY_FEED_LEDGER_TYPES = [
  "provider_earnings",
  "payout",
  "tip",
  "travel_fee",
  "cancellation_fee",
  "walk_in_additional_charge",
  "refund",
  "provider_subscription_payment",
  "provider_ads_payment",
  "gift_card_sale",
  "membership_sale",
] as const;

export const PROVIDER_ACTIVITY_FEED_BOOKING_EVENT_TYPES = [
  "rescheduled",
  "confirmed",
  "service_started",
] as const;

export const PROVIDER_ACTIVITY_FEED_NEW_CLIENT_SOURCES = [
  "manual_new_customer",
  "manual_existing_platform",
  "import",
  "sale",
  "product_order",
  "conversation",
  "manual",
] as const;

/** Activity types intentionally omitted (see `excluded_basis` on feed payload). */
export const PROVIDER_ACTIVITY_FEED_EXCLUDED = {
  ledger: [
    "payment (gross customer charge — not provider take-home)",
    "platform_fee / service_fee / tax (retained or pass-through; not surfaced separately)",
    "promotion_discount / membership_discount / loyalty_discount (contra rows)",
    "wallet_payment / gift_card_payment (tender legs)",
  ],
  booking_events: [
    "provider_on_way",
    "provider_arrived",
    "otp_sent / otp_verified / qr_code_generated / qr_code_verified",
    "payment_received (ledger earnings row is the canonical money event)",
    "service_completed (bookings.completed_at milestone is used instead)",
    "refunded / deleted / updated / additional_payment_* micro-events",
  ],
  clients:
    "provider_clients rows with relationship_source=booking (auto-created on first completion — booking milestones cover this)",
  product_orders: "order_source=appointment fulfillment mirrors (lines live on the booking)",
} as const;

export function buildActivityFeedExcludedBasis(): string {
  return [
    `Ledger omitted: ${PROVIDER_ACTIVITY_FEED_EXCLUDED.ledger.join("; ")}.`,
    `Booking events omitted: ${PROVIDER_ACTIVITY_FEED_EXCLUDED.booking_events.join("; ")}.`,
    `Clients: ${PROVIDER_ACTIVITY_FEED_EXCLUDED.clients}.`,
    `Product orders: ${PROVIDER_ACTIVITY_FEED_EXCLUDED.product_orders}.`,
  ].join(" ");
}
