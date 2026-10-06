import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const ACCOUNT_LINK_CONFIG = {
  prefix: "account-link",
  limit: 15,
  windowSeconds: 15 * 60,
} as const;

export async function checkAccountLinkRateLimit(request: Request): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(ACCOUNT_LINK_CONFIG, ip);
}
