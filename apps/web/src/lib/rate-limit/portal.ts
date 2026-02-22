/**
 * Simple in-memory rate limiter for portal endpoints.
 * In production, use Redis or similar for multi-instance deployments.
 */

const requests = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // per IP per window

function getClientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export function checkPortalRateLimit(request: Request): { allowed: boolean } {
  const id = getClientId(request);
  const now = Date.now();
  const record = requests.get(id);

  if (!record) {
    requests.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (now > record.resetAt) {
    requests.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    return { allowed: false };
  }
  return { allowed: true };
}
