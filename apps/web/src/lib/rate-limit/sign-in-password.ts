import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const PASSWORD_CONFIG = {
  prefix: "sign-in-password",
  limit: 10,
  windowSeconds: 15 * 60,
} as const;

const PASSWORD_FAIL_CONFIG = {
  prefix: "sign-in-password-fail",
  limit: 10,
  windowSeconds: 15 * 60,
} as const;

export { getClientIp };

export async function checkSignInPasswordRateLimit(request: Request): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(PASSWORD_CONFIG, ip);
}

/** Incremented only after invalid credentials — soft cap alongside checkSignInPasswordRateLimit. */
export async function checkSignInPasswordFailRateLimit(request: Request): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(PASSWORD_FAIL_CONFIG, ip);
}

export async function noteSignInPasswordFailure(request: Request): Promise<RateLimitResult> {
  return checkSignInPasswordFailRateLimit(request);
}
