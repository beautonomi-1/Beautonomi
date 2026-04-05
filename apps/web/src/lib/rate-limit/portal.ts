import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const PORTAL_CONFIG = {
  prefix: "portal",
  limit: 30,
  windowSeconds: 60,
} as const;

export async function checkPortalRateLimit(
  request: Request,
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(PORTAL_CONFIG, ip);
}
