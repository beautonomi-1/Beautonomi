import { checkRateLimit, getClientIp } from "./store";

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

const USER_CONFIG = {
  prefix: "hold-user",
  limit: 10,
  windowSeconds: 15 * 60,
} as const;

export { getClientIp };

export interface HoldRateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  remainingIp?: number;
  remainingFingerprint?: number;
}

export type CheckHoldRateLimitOptions = {
  userId?: string | null;
  /** Same-device hold replacement (edit date/time) — do not count against user/fingerprint limits. */
  skipClientLimit?: boolean;
};

export async function checkHoldRateLimit(
  request: Request,
  guestFingerprint: string | null,
  options?: CheckHoldRateLimitOptions,
): Promise<HoldRateLimitResult> {
  const ip = getClientIp(request);
  const userId = options?.userId?.trim() || null;
  const skipClientLimit = options?.skipClientLimit === true;

  const ipResult = await checkRateLimit(IP_CONFIG, ip);
  if (!ipResult.allowed) {
    return {
      allowed: false,
      reason: "Too many booking attempts. Please try again in 15 minutes.",
      retryAfterSeconds: ipResult.retryAfterSeconds,
      remainingIp: 0,
    };
  }

  if (!skipClientLimit) {
    if (userId) {
      const userResult = await checkRateLimit(USER_CONFIG, userId);
      if (!userResult.allowed) {
        return {
          allowed: false,
          reason: "Too many booking attempts. Please try again later.",
          retryAfterSeconds: userResult.retryAfterSeconds,
          remainingIp: ipResult.remaining,
        };
      }
      return {
        allowed: true,
        remainingIp: ipResult.remaining,
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
