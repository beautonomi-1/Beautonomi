import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

/**
 * Rate limit for POST /api/payments/initialize.
 *
 * Each payment initialization triggers a Paystack API call and reserves a booking slot.
 * Without rate limiting, a single customer or bot could spam initializations, burning
 * Paystack API quota and creating phantom holds on booking slots.
 *
 * Limits: 10 per user+IP per 15 minutes (generous for real customers, tight for bots).
 */
const PAYMENT_INITIALIZE_CONFIG = {
  prefix: "payment-init",
  limit: 10,
  windowSeconds: 15 * 60,
} as const;

export { getClientIp };
export type PaymentInitRateLimitResult = RateLimitResult;

export async function checkPaymentInitRateLimit(
  request: Request,
  userId?: string,
): Promise<PaymentInitRateLimitResult> {
  // Scope per user when authenticated, fallback to IP for unauthenticated paths.
  const ip = getClientIp(request);
  const key = userId ? `uid:${userId}:${ip}` : ip;
  return checkRateLimit(PAYMENT_INITIALIZE_CONFIG, key);
}
