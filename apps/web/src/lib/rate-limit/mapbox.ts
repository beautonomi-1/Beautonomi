import { checkRateLimit, getClientIp, type RateLimitConfig } from "./store";
import { NextResponse } from "next/server";

/**
 * Rate-limit config for the Mapbox proxy routes.
 * When Upstash is configured this is distributed across all serverless instances.
 * Falls back to in-memory per-instance when Upstash env vars are absent (dev / single-instance).
 *
 * Limits are intentionally generous for legitimate product use:
 *   - Authenticated user: 120 requests / 60 s
 *   - Anonymous (IP-keyed): 20 requests / 60 s (e.g. pre-login address picker)
 */
const MAPBOX_AUTHED_CONFIG: RateLimitConfig = {
  prefix: "mapbox:authed",
  limit: 120,
  windowSeconds: 60,
};

const MAPBOX_ANON_CONFIG: RateLimitConfig = {
  prefix: "mapbox:anon",
  limit: 20,
  windowSeconds: 60,
};

/**
 * Check the Mapbox proxy rate limit.
 * Returns a 429 NextResponse when the limit is exceeded, or null to continue.
 *
 * @param request - incoming Next/Node request
 * @param userId  - authenticated user id (undefined for anonymous callers)
 */
export async function checkMapboxRateLimit(
  request: Request,
  userId: string | undefined,
): Promise<NextResponse | null> {
  const config = userId ? MAPBOX_AUTHED_CONFIG : MAPBOX_ANON_CONFIG;
  const key = userId ?? getClientIp(request);

  const result = await checkRateLimit(config, key);
  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down.", code: "RATE_LIMIT_EXCEEDED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds ?? 60),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  return null;
}
