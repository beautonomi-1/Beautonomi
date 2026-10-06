import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

export { getClientIp };
import { normalizeOtpVerifyIdentity } from "./otp-verify";

const IP_CONFIG = {
  prefix: "otp-send:ip",
  limit: 20,
  windowSeconds: 15 * 60,
} as const;

const IDENTITY_CONFIG = {
  prefix: "otp-send:identity",
  limit: 6,
  windowSeconds: 15 * 60,
} as const;

export async function checkOtpSendRateLimit(
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
