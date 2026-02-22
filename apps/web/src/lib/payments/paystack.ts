/**
 * Paystack Payment Utilities
 * 
 * Server-side utilities for Paystack payment processing
 * Following official Paystack API documentation: https://paystack.com/docs/api/
 */

/**
 * Verify Paystack configuration
 */
export function verifyPaystackConfig(): {
  configured: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  
  if (!process.env.PAYSTACK_SECRET_KEY) {
    missing.push("PAYSTACK_SECRET_KEY");
  }
  
  return {
    configured: missing.length === 0,
    missing,
  };
}

/**
 * Convert amount to Paystack's smallest currency unit (kobo/cents)
 */
export function convertToSmallestUnit(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert from Paystack's smallest currency unit to regular amount
 */
export function convertFromSmallestUnit(amount: number): number {
  return amount / 100;
}

/**
 * Validate Paystack amount
 */
export function validateAmount(amount: number): {
  valid: boolean;
  error?: string;
} {
  if (amount < 0.01) {
    return {
      valid: false,
      error: "Amount must be at least 0.01",
    };
  }
  
  if (amount > 1000000) {
    return {
      valid: false,
      error: "Amount exceeds maximum limit",
    };
  }
  
  return { valid: true };
}

/**
 * Generate unique transaction reference
 */
export function generateTransactionReference(prefix: string, id: string): string {
  const timestamp = Date.now();
  return `${prefix}_${id}_${timestamp}`;
}

/**
 * Paystack API base URL
 */
export const PAYSTACK_API_BASE = "https://api.paystack.co";

/**
 * Paystack API endpoints
 */
export const PAYSTACK_ENDPOINTS = {
  initialize: `${PAYSTACK_API_BASE}/transaction/initialize`,
  verify: `${PAYSTACK_API_BASE}/transaction/verify`,
  refund: `${PAYSTACK_API_BASE}/refund`,
  listTransactions: `${PAYSTACK_API_BASE}/transaction`,
} as const;
