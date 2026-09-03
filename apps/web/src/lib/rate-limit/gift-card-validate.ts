import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const USER_CONFIG = {
  prefix: "gift-card-validate:user",
  limit: 30,
  windowSeconds: 60,
} as const;

const IP_CONFIG = {
  prefix: "gift-card-validate:ip",
  limit: 60,
  windowSeconds: 60,
} as const;

export async function checkGiftCardValidateRateLimit(
  request: Request,
  userId: string | null,
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const ipResult = await checkRateLimit(IP_CONFIG, ip);
  if (!ipResult.allowed) return ipResult;

  if (userId) {
    return checkRateLimit(USER_CONFIG, userId);
  }

  return ipResult;
}
