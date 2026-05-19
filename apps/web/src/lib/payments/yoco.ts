/**
 * Yoco Payment Utilities
 *
 * Server-side utilities for Yoco payment processing.
 * Following official Yoco API documentation: https://developer.yoco.com/api-reference
 *
 * Yoco has two distinct APIs with two different auth mechanisms:
 *
 *   1) Yoco API  (https://api.yoco.com)            — Web POS, Orders, Payments,
 *      Refunds, Payouts, Capital. Bearer authentication uses a JWT minted via
 *      the OAuth 2.0 flow at iam.yoco.com. See `./yoco-oauth.ts`.
 *
 *   2) Checkout API (https://payments.yoco.com)    — Hosted checkout pages.
 *      Bearer authentication uses the long-lived `sk_*` secret key from the
 *      Yoco dashboard. This is what `provider_yoco_integrations.secret_key`
 *      stores. It is NOT valid for the Yoco API above.
 *
 * Both environments have sandbox twins (`*.yocosandbox.com`).
 */

import { toCents, fromCents } from "@beautonomi/utils";

export type YocoEnvironment = "sandbox" | "live";

/**
 * Resolve the platform-wide default environment from env vars. Per-tenant
 * overrides live in `tenant_yoco_oauth_apps.environment` and per-provider in
 * `provider_yoco_integrations.environment` — callers should prefer those.
 */
export function getDefaultYocoEnvironment(): YocoEnvironment {
  const raw = (process.env.YOCO_ENV ?? "live").toLowerCase();
  return raw === "sandbox" ? "sandbox" : "live";
}

/**
 * Hostnames per Yoco environment. Beautonomi reads from env vars to allow
 * pointing at a mock server in tests without code changes.
 */
export function getYocoBases(env: YocoEnvironment) {
  if (env === "sandbox") {
    return {
      api:      process.env.YOCO_API_BASE_SANDBOX      ?? "https://api.yocosandbox.com",
      iam:      process.env.YOCO_IAM_BASE_SANDBOX      ?? "https://iam.yocosandbox.com",
      checkout: process.env.YOCO_CHECKOUT_BASE_SANDBOX ?? "https://payments.yocosandbox.com",
    };
  }
  return {
    api:      process.env.YOCO_API_BASE      ?? "https://api.yoco.com",
    iam:      process.env.YOCO_IAM_BASE      ?? "https://iam.yoco.com",
    checkout: process.env.YOCO_CHECKOUT_BASE ?? "https://payments.yoco.com",
  };
}

/**
 * Build the endpoint URLs for a given environment. The Web POS endpoints
 * (`/v1/webpos/*`) require an OAuth JWT; the Checkout endpoints
 * (`/api/checkouts`) accept the dashboard secret key.
 */
export function getYocoEndpoints(env: YocoEnvironment = getDefaultYocoEnvironment()) {
  const bases = getYocoBases(env);
  return {
    bases,
    /** POST body `{ name }` — trailing slash matches OpenAPI path `/v1/webpos/`. */
    createWebPosDevice:   `${bases.api}/v1/webpos/`,
    createWebPosPayment:  (deviceId: string) => `${bases.api}/v1/webpos/${deviceId}/payments`,
    getWebPosDevice:      (deviceId: string) => `${bases.api}/v1/webpos/${deviceId}`,
    getWebPosPayment:     (deviceId: string, paymentId: string) =>
      `${bases.api}/v1/webpos/${deviceId}/payments/${paymentId}`,

    // OAuth (iam.yoco.com)
    authorize:  `${bases.iam}/oauth2/authorize`,
    token:      `${bases.iam}/oauth2/token`,
    userinfo:   `${bases.iam}/oauth2/userinfo`,
    logout:     `${bases.iam}/oauth2/logout`,
    tokenInfo:  `${bases.api}/v1/oauth2/token-info`,
    jwks:       `${bases.iam}/.well-known/jwks.json`,

    // Yoco API (require OAuth Bearer)
    listPayments:        `${bases.api}/v1/payments`,
    getPayment:          (paymentId: string) => `${bases.api}/v1/payments/${paymentId}`,
    listRefunds:         `${bases.api}/v1/refunds`,
    getRefund:           (refundId: string) => `${bases.api}/v1/refunds/${refundId}`,
    listWebhookSubs:     `${bases.api}/v1/webhooks/subscriptions/`,
    createWebhookSub:    `${bases.api}/v1/webhooks/subscriptions/`,
    deleteWebhookSub:    (subscriptionId: string) =>
      `${bases.api}/v1/webhooks/subscriptions/${subscriptionId}`,
    rotateWebhookSecret: (subscriptionId: string) =>
      `${bases.api}/v1/webhooks/subscriptions/${subscriptionId}/secret`,

    // Checkout API (Bearer dashboard secret_key)
    createCheckout: `${bases.checkout}/api/checkouts`,
    refundCheckout: (checkoutId: string) => `${bases.checkout}/api/checkouts/${checkoutId}/refund`,
  } as const;
}

/**
 * Backward-compatible alias for callers that import the live endpoint map
 * directly. New code should prefer `getYocoEndpoints(env)`.
 *
 * @deprecated Use `getYocoEndpoints(env)` so sandbox/live can be toggled per
 *   tenant or provider.
 */
export const YOCO_ENDPOINTS = getYocoEndpoints("live");

/** @deprecated Use `getYocoBases('live').checkout` (now `payments.yoco.com`). */
export const YOCO_API_BASE = getYocoBases("live").checkout;

/** @deprecated Use `getYocoBases(env).api`. */
export const YOCO_WEBPOS_API_BASE = getYocoBases("live").api;

/**
 * Verify Yoco configuration
 */
export function verifyYocoConfig(secretKey?: string, publicKey?: string): {
  configured: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!secretKey) {
    missing.push("YOCO_SECRET_KEY");
  }

  if (!publicKey) {
    missing.push("YOCO_PUBLIC_KEY");
  }

  return {
    configured: missing.length === 0,
    missing,
  };
}

/**
 * Convert amount to cents (Yoco uses cents for ZAR)
 */
export function convertToCents(amount: number): number {
  return toCents(amount);
}

/**
 * Convert from cents to amount
 */
export function convertFromCents(amount: number): number {
  return fromCents(amount);
}

/**
 * Validate Yoco amount
 */
export function validateYocoAmount(amount: number): {
  valid: boolean;
  error?: string;
} {
  if (amount < 0.01) {
    return {
      valid: false,
      error: "Amount must be at least 0.01 ZAR",
    };
  }

  if (amount > 100000) {
    return {
      valid: false,
      error: "Amount exceeds maximum limit of 100,000 ZAR",
    };
  }

  return { valid: true };
}

/**
 * Yoco Webhook Events
 * Based on:
 *   - https://developer.yoco.com/api-reference/checkout-api/webhook-events
 *   - https://developer.yoco.com/api-reference/yoco-api/webhook-events
 */
export const YOCO_WEBHOOK_EVENTS = {
  // Checkout API events (Bearer dashboard secret)
  PAYMENT_NOTIFICATION:               "payment.notification",
  REFUND_NOTIFICATION_SUCCESS_FULL:    "refund.notification.success.full",
  REFUND_NOTIFICATION_SUCCESS_PARTIAL: "refund.notification.success.partial",
  REFUND_NOTIFICATION_FAILURE_FULL:    "refund.notification.failure.full",
  REFUND_NOTIFICATION_FAILURE_PARTIAL: "refund.notification.failure.partial",
  // Yoco API events (Bearer OAuth JWT)
  PAYMENT_SUCCEEDED:  "payment.succeeded",
  PAYMENT_FAILED:     "payment.failed",
  PAYMENT_REFUNDED:   "payment.refunded",
  PAYMENT_CREATED:    "payment.created",
} as const;
