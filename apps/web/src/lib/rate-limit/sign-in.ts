import type { RateLimitResult } from "./store";
import { checkSignInPasswordRateLimit } from "./sign-in-password";

export { getClientIp } from "./sign-in-password";

export type SignInRateLimitResult = RateLimitResult;

/** @deprecated Use checkSignInPasswordRateLimit — kept for tests/mocks. */
export async function checkSignInRateLimit(request: Request): Promise<SignInRateLimitResult> {
  return checkSignInPasswordRateLimit(request);
}

/** @deprecated No longer needed — the store increments on check. Kept for call-site compatibility. */
export function incrementSignInAttempts(_request: Request): void {
  // no-op: distributed store increments atomically inside checkRateLimit
}
