/**
 * Yoco Payment Utilities
 * 
 * Server-side utilities for Yoco Web POS payment processing
 * Following official Yoco API documentation: https://developer.yoco.com/api-reference
 */

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
  return Math.round(amount * 100);
}

/**
 * Convert from cents to amount
 */
export function convertFromCents(amount: number): number {
  return amount / 100;
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
 * Yoco API base URL
 */
export const YOCO_API_BASE = "https://online.yoco.com";

/**
 * Yoco API endpoints
 * Based on: https://developer.yoco.com/api-reference
 */
export const YOCO_ENDPOINTS = {
  // Web POS
  createWebPosDevice: `${YOCO_API_BASE}/v1/webpos`,
  createWebPosPayment: (deviceId: string) => `${YOCO_API_BASE}/v1/webpos/${deviceId}/payments`,
  getWebPosDevice: (deviceId: string) => `${YOCO_API_BASE}/v1/webpos/${deviceId}`,
  getWebPosPayment: (deviceId: string, paymentId: string) => `${YOCO_API_BASE}/v1/webpos/${deviceId}/payments/${paymentId}`,
  
  // OAuth
  authorize: `${YOCO_API_BASE}/oauth2/authorize`,
  token: `${YOCO_API_BASE}/oauth2/token`,
  tokenInfo: `${YOCO_API_BASE}/v1/oauth2/token-info`,
  
  // Payments
  listPayments: `${YOCO_API_BASE}/v1/payments`,
  getPayment: (paymentId: string) => `${YOCO_API_BASE}/v1/payments/${paymentId}`,
  
  // Refunds
  listRefunds: `${YOCO_API_BASE}/v1/refunds`,
  getRefund: (refundId: string) => `${YOCO_API_BASE}/v1/refunds/${refundId}`,
  
  // Checkout
  createCheckout: `${YOCO_API_BASE}/v1/checkouts`,
  refundCheckout: (checkoutId: string) => `${YOCO_API_BASE}/v1/checkouts/${checkoutId}/refund`,
} as const;

/**
 * Yoco Webhook Events
 * Based on: https://developer.yoco.com/api-reference/checkout-api/webhook-events
 */
export const YOCO_WEBHOOK_EVENTS = {
  PAYMENT_NOTIFICATION: "payment.notification",
  REFUND_NOTIFICATION_SUCCESS_FULL: "refund.notification.success.full",
  REFUND_NOTIFICATION_SUCCESS_PARTIAL: "refund.notification.success.partial",
  REFUND_NOTIFICATION_FAILURE_FULL: "refund.notification.failure.full",
  REFUND_NOTIFICATION_FAILURE_PARTIAL: "refund.notification.failure.partial",
} as const;
