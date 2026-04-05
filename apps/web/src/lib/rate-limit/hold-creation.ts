import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const IP_CONFIG = {
  prefix: "hold-ip",
  limit: 5,
  windowSeconds: 15 * 60,
} as const;

const FINGERPRINT_CONFIG = {
  prefix: "hold-fp",
  limit: 3,
  windowSeconds: 60 * 60,
} as const;

export { getClientIp };

export interface HoldRateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  remainingIp?: number;
  remainingFingerprint?: number;
}

export async function checkHoldRateLimit(
  request: Request,
  guestFingerprint: string | null,
): Promise<HoldRateLimitResult> {
  const ip = getClientIp(request);

  const ipResult = await checkRateLimit(IP_CONFIG, ip);
  if (!ipResult.allowed) {
    return {
      allowed: false,
      reason: "Too many booking attempts. Please try again in 15 minutes.",
      retryAfterSeconds: ipResult.retryAfterSeconds,
      remainingIp: 0,
    };
  }

  if (guestFingerprint) {
    const fpResult = await checkRateLimit(FINGERPRINT_CONFIG, guestFingerprint);
    if (!fpResult.allowed) {
      return {
        allowed: false,
        reason: "Too many booking attempts from this device. Please try again later.",
        retryAfterSeconds: fpResult.retryAfterSeconds,
        remainingIp: ipResult.remaining,
        remainingFingerprint: 0,
      };
    }
    return {
      allowed: true,
      remainingIp: ipResult.remaining,
      remainingFingerprint: fpResult.remaining,
    };
  }

  return {
    allowed: true,
    remainingIp: ipResult.remaining,
  };
}

/** @deprecated Distributed store increments atomically. Kept for call-site compatibility. */
export function incrementHoldRateLimit(
  _request: Request,
  _guestFingerprint: string | null,
): void {}
