/**
 * Canonical `feature_flags.feature_key` values for payments and commerce.
 * Use these instead of string literals so routes and admin seeds stay aligned.
 */
export const FEATURE_FLAG_KEYS = {
  PAYMENT_PAYSTACK: "payment_paystack",
  /** Master switch for provider-side Paystack Virtual Terminal collection and management. */
  PAYMENT_PAYSTACK_VIRTUAL_TERMINAL: "payment_paystack_virtual_terminal",
  /** Master switch for provider-side Yoco collection and management. */
  PAYMENT_YOCO: "payment_yoco",
  /** Master switch for the provider booking payment-link method (send a Paystack checkout link). */
  PAYMENT_LINK: "payment_link",
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
  /** Auto-send signed portal links to shadow/guest customers (email + SMS). */
  GUEST_BOOKING_PORTAL: "guest_booking_portal",
  /**
   * Unified provider POS checkout (services + products without a booking).
   * Disabled by default — use bookings for service sales and walk-in retail for products.
   * Booking card payments still use `/api/provider/sales` regardless of this flag.
   */
  PROVIDER_UNIFIED_POS: "provider.unified_pos_checkout",

  // ── Verification / KYC ──────────────────────────────────────────────────────

  /**
   * Master switch for Sumsub-automated KYC.
   * Effective availability = this flag AND credentials present in
   * sumsub_integration_config.  Toggling this off hides the Sumsub CTA on all
   * clients and returns 403 from the Sumsub token endpoints.
   */
  VERIFICATION_SUMSUB: "verification.sumsub.enabled",

  /**
   * Master switch for manual document upload.
   * When disabled, POST /api/me/verification returns 403 MANUAL_VERIFICATION_DISABLED.
   * Defaults to true so existing deployments are unaffected.
   */
  VERIFICATION_MANUAL: "verification.manual.enabled",

  /**
   * When enabled, providers must have approved identity verification before
   * they can complete setup (identity step becomes required) and auto-approve
   * will not activate unverified providers.
   */
  VERIFICATION_REQUIRED_FOR_PROVIDERS: "provider_verification",

  /**
   * When enabled, POST /api/provider/payouts is blocked until the provider
   * has approved identity verification.
   */
  VERIFICATION_REQUIRED_FOR_PAYOUTS: "verification.sumsub.required_for_payouts",
} as const;

export type PaymentRelatedFeatureKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];
