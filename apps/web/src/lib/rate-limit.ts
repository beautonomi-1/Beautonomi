/**
 * Simple in-memory rate limiter for admin export endpoints.
 * Note: In serverless, each instance has its own memory - not distributed.
 * For production at scale, consider Redis (e.g. Upstash) or DB-backed limits.
 */

const MAX_REQUESTS_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const store = new Map<
  string,
  { count: number; resetAt: number }
>();

function getKey(userId: string, endpoint: string): string {
  return `${userId}:${endpoint}`;
}

export function checkRateLimit(userId: string, endpoint: string): {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
} {
  const key = getKey(userId, endpoint);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return { allowed: true, remaining: MAX_REQUESTS_PER_HOUR - 1 };
  }

  // Reset if window expired
  if (now >= entry.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return { allowed: true, remaining: MAX_REQUESTS_PER_HOUR - 1 };
  }

  if (entry.count >= MAX_REQUESTS_PER_HOUR) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_HOUR - entry.count,
  };
}
