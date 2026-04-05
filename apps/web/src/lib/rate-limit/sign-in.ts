import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const SIGN_IN_CONFIG = {
  prefix: "sign-in",
  limit: 10,
  windowSeconds: 15 * 60,
} as const;

export { getClientIp };

export type SignInRateLimitResult = RateLimitResult;

export async function checkSignInRateLimit(
  request: Request,
): Promise<SignInRateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(SIGN_IN_CONFIG, ip);
}

/** @deprecated No longer needed — the store increments on check. Kept for call-site compatibility. */
export function incrementSignInAttempts(_request: Request): void {
  // no-op: distributed store increments atomically inside checkRateLimit
}
