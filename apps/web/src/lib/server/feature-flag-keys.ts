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
  /** Master switch for provider-side Beautonomi card machine (PayCloud) collection. */
  PAYMENT_PAYCLOUD: "payment_paycloud",
  /** Enable QR wallet payments on PayCloud terminals. */
  PAYMENT_PAYCLOUD_QR: "payment_paycloud_qr",
  /** Enable cashback on PayCloud terminal sales. */
  PAYMENT_PAYCLOUD_CASHBACK: "payment_paycloud_cashback",
  /** Same-terminal Intent on P5/P5L (gated; requires hardware validation). */
  PAYMENT_PAYCLOUD_SAME_TERMINAL: "payment_paycloud_same_terminal",
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
   * Master switch for Didit-automated KYC.
   * Effective availability = this flag AND DIDIT_API_KEY + DIDIT_WORKFLOW_ID +
   * DIDIT_WEBHOOK_SECRET env vars present.
   */
  VERIFICATION_DIDIT: "verification.didit.enabled",

  /**
   * @deprecated Legacy Sumsub flag key — kept for reference only; Sumsub is removed.
   * Do not use in new code.
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
  VERIFICATION_REQUIRED_FOR_PAYOUTS: "verification.didit.required_for_payouts",

  /**
   * When enabled, a customer must have approved identity verification before
   * their FIRST booking is created. Subsequent bookings are not re-checked.
   */
  VERIFICATION_REQUIRED_FOR_CUSTOMERS: "verification.required_for_customers",

  /**
   * When enabled, pass confirm-legal-details form values as expected_details
   * to Didit for name/DOB cross-validation. Mismatch routes to pending_review.
   */
  VERIFICATION_DIDIT_CROSS_VALIDATE: "verification.didit.cross_validate",

  /**
   * Minimum age (years) for identity verification eligibility. Default: 18.
   * Stored as a numeric value in the flag metadata.
   */
  VERIFICATION_MIN_AGE: "verification.min_age",

  /**
   * When enabled, detect when the same verified identity is already approved
   * on another account and raise a fraud-review flag.
   */
  VERIFICATION_DEDUPE: "verification.dedupe",

  /**
   * Master switch for Didit KYB (business verification) for registered companies.
   * Effective when verification.didit.enabled is also on.
   */
  VERIFICATION_DIDIT_KYB: "verification.didit.kyb.enabled",

  /**
   * When enabled (and KYB master is on), registered business providers must
   * complete KYB in addition to person KYC for go-live / payout gates.
   */
  VERIFICATION_DIDIT_KYB_REQUIRED_FOR_BUSINESS:
    "verification.didit.kyb.required_for_business",

  // ── Terminal capture & commerce ──────────────────────────────────────────────

  /**
   * Master switch for the generic card machine / payment terminal onboarding
   * question and provider profile capture. Default ON.
   */
  PROVIDER_TERMINAL_CAPTURE: "provider_terminal_capture_enabled",

  /**
   * Show Commercial Operations → Terminal Insights in the admin portal.
   */
  SUPERADMIN_TERMINAL_INSIGHTS: "superadmin_terminal_insights_enabled",

  /**
   * Show terminal upsell banners to providers without or interested in terminals.
   */
  TERMINAL_UPSELL: "terminal_upsell_enabled",

  /**
   * Enable the terminal product catalog (admin management + provider browsing).
   */
  TERMINAL_PRODUCT_CATALOG: "terminal_product_catalog_enabled",

  /**
   * Allow providers to place terminal orders (purchase / plan-included bundle).
   * Requires TERMINAL_PRODUCT_CATALOG to also be enabled.
   */
  TERMINAL_ECOMMERCE: "terminal_ecommerce_enabled",

  /**
   * Enable terminal device bundling within subscription plans.
   */
  TERMINAL_SUBSCRIPTION_BUNDLE: "terminal_subscription_bundle_enabled",

  /**
   * Enable targeted terminal marketing campaigns to provider cohorts.
   */
  TERMINAL_CAMPAIGNS: "terminal_campaigns_enabled",

  /**
   * Enable accounting postings and GL journal entries for terminal transactions.
   */
  TERMINAL_ACCOUNTING: "terminal_accounting_enabled",

  // ── Terminal integrations hub (vendor-agnostic connect/disconnect) ─────────

  /**
   * Master switch for the Terminal Integrations section in provider settings.
   * When off, the entire "Terminal Integrations" hub is hidden. Default ON.
   */
  TERMINAL_INTEGRATIONS: "terminal_integrations_enabled",

  /**
   * Per-vendor feature flags. Require TERMINAL_INTEGRATIONS to also be enabled.
   * Add new vendors by inserting into terminal_vendor_configs + a flag here.
   */
  TERMINAL_VENDOR_WAPPOINT: "terminal_vendor_wappoint_enabled",
  TERMINAL_VENDOR_IKHOKHA: "terminal_vendor_ikhokha_enabled",
  TERMINAL_VENDOR_FNB: "terminal_vendor_fnb_enabled",
  TERMINAL_VENDOR_CAPITEC: "terminal_vendor_capitec_enabled",
  TERMINAL_VENDOR_NEDBANK: "terminal_vendor_nedbank_enabled",
  TERMINAL_VENDOR_ABSA: "terminal_vendor_absa_enabled",
  TERMINAL_VENDOR_STANDARD_BANK: "terminal_vendor_standard_bank_enabled",

  /** Platform user referral program (wallet rewards for inviting friends). */
  REFERRAL_PROGRAM: "referral_program",

  /** Postgres provider_finance_summary RPC for finance aggregates (shadow-compare before enable). */
  PROVIDER_FINANCE_SUMMARY_RPC: "reports.provider_finance_summary_rpc",
} as const;

export type PaymentRelatedFeatureKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];
