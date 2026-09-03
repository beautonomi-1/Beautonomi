import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const IDENTITY_CONFIG = {
  prefix: "otp-verify:identity",
  limit: 8,
  windowSeconds: 15 * 60,
} as const;

const IP_CONFIG = {
  prefix: "otp-verify:ip",
  limit: 30,
  windowSeconds: 15 * 60,
} as const;

export function normalizeOtpVerifyIdentity(identity: string): string {
  const trimmed = identity.trim().toLowerCase();
  return trimmed;
}

export async function checkOtpVerifyRateLimit(
  request: Request,
  identity: string,
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const ipResult = await checkRateLimit(IP_CONFIG, ip);
  if (ipResult.allowed === false) return ipResult;

  const key = normalizeOtpVerifyIdentity(identity);
  if (!key) return ipResult;

  return checkRateLimit(IDENTITY_CONFIG, key);
}
