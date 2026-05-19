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
  /** When enabled, custom-offer checkout may use wallet / gift / loyalty (UI + `POST .../pay`). */
  CUSTOM_OFFER_FULL_CHECKOUT: "commerce.custom_offer_full_checkout",
  /**
   * §Yoco-OAuth 2026-05: when enabled, surface the new "Connect Yoco" OAuth
   * flow in provider settings (web + mobile). When disabled, only the legacy
   * dashboard-key paste path is visible — hosted checkout still works but real
   * Web POS terminals cannot be provisioned.
   */
  YOCO_OAUTH_V2: "yoco_oauth_v2",
} as const;

export type PaymentRelatedFeatureKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];
