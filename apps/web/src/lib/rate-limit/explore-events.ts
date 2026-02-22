/**
 * Rate limiter for Explore events API (views, likes).
 * Uses IP + UA hash, per-minute caps.
 * In production, use Redis or similar for multi-instance deployments.
 */

const requests = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_EVENTS_PER_MINUTE = 60; // per actor per window

function getClientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "";
  // Simple hash: IP + UA for actor identification (anon_hash is computed separately in API)
  return `${ip}:${ua}`;
}

export function checkExploreEventsRateLimit(request: Request): {
  allowed: boolean;
  actorKey?: string;
} {
  const actorKey = getClientId(request);
  const now = Date.now();
  const record = requests.get(actorKey);

  if (!record) {
    requests.set(actorKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, actorKey };
  }

  if (now > record.resetAt) {
    requests.set(actorKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, actorKey };
  }

  record.count++;
  if (record.count > MAX_EVENTS_PER_MINUTE) {
    return { allowed: false, actorKey };
  }
  return { allowed: true, actorKey };
}
