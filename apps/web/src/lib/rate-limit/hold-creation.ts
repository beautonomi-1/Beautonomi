/**
 * In-memory rate limiting for booking hold creation.
 * Spec: 5 per IP per 15 min, 3 per fingerprint per hour, 1 active per fingerprint.
 * Note: In-memory only - resets on serverless cold start. For production at scale, use Redis.
 */

const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 5;
const FINGERPRINT_WINDOW_MS = 60 * 60 * 1000;
const FINGERPRINT_MAX = 3;

interface Entry {
  count: number;
  firstAt: number;
}

const ipCounts = new Map<string, Entry>();
const fingerprintCounts = new Map<string, Entry>();

function pruneExpired(
  map: Map<string, Entry>,
  windowMs: number
) {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (now - entry.firstAt > windowMs) {
      map.delete(key);
    }
  }
}

function checkLimit(
  map: Map<string, Entry>,
  key: string,
  windowMs: number,
  max: number
): boolean {
  pruneExpired(map, windowMs);
  const now = Date.now();
  const entry = map.get(key);
  if (!entry) return true;
  if (now - entry.firstAt > windowMs) {
    map.delete(key);
    return true;
  }
  return entry.count < max;
}

function increment(
  map: Map<string, Entry>,
  key: string,
  windowMs: number,
  max: number
): void {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry) {
    map.set(key, { count: 1, firstAt: now });
    return;
  }
  if (now - entry.firstAt > windowMs) {
    map.set(key, { count: 1, firstAt: now });
    return;
  }
  entry.count = Math.min(entry.count + 1, max + 1);
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export interface HoldRateLimitResult {
  allowed: boolean;
  reason?: string;
}

export function checkHoldRateLimit(
  request: Request,
  guestFingerprint: string | null
): HoldRateLimitResult {
  const ip = getClientIp(request);

  if (!checkLimit(ipCounts, ip, IP_WINDOW_MS, IP_MAX)) {
    return {
      allowed: false,
      reason: "Too many booking attempts. Please try again in 15 minutes.",
    };
  }

  if (guestFingerprint) {
    if (!checkLimit(fingerprintCounts, guestFingerprint, FINGERPRINT_WINDOW_MS, FINGERPRINT_MAX)) {
      return {
        allowed: false,
        reason: "Too many booking attempts from this device. Please try again later.",
      };
    }
  }

  return { allowed: true };
}

export function incrementHoldRateLimit(
  request: Request,
  guestFingerprint: string | null
): void {
  const ip = getClientIp(request);
  increment(ipCounts, ip, IP_WINDOW_MS, IP_MAX);
  if (guestFingerprint) {
    increment(fingerprintCounts, guestFingerprint, FINGERPRINT_WINDOW_MS, FINGERPRINT_MAX);
  }
}
