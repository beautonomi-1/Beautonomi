/**
 * Canonical `feature_flags.feature_key` values for payments and commerce.
 * Use these instead of string literals so routes and admin seeds stay aligned.
 */
export const FEATURE_FLAG_KEYS = {
  PAYMENT_PAYSTACK: "payment_paystack",
  PAYMENT_WALLET: "payment_wallet",
  GIFT_CARDS: "gift_cards",
  /** When disabled (tenant or global row), providers cannot create/send custom offers. */
  PROVIDER_CUSTOM_OFFERS: "commerce.provider_custom_offers",
} as const;

export type PaymentRelatedFeatureKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];
