import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const APP_REVIEW_VERIFY_CONFIG = {
  prefix: "app-review-verify",
  limit: 30,
  windowSeconds: 15 * 60,
} as const;

export async function checkAppReviewVerifyRateLimit(request: Request): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(APP_REVIEW_VERIFY_CONFIG, ip);
}
