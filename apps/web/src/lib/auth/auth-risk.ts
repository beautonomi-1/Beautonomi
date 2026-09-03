import { checkRateLimit, getClientIp, type RateLimitResult } from "@/lib/rate-limit/store";

/**
 * Soft risk window: after this many password sign-ins / OTP sends from one IP,
 * subsequent attempts must pass Turnstile (when captcha secrets are configured).
 */
const AUTH_RISK_CONFIG = {
  prefix: "auth-risk-ip",
  limit: 3,
  windowSeconds: 15 * 60,
} as const;

export async function noteAuthAttemptAndShouldChallenge(
  request: Request,
): Promise<{ requireCaptcha: boolean; signal: RateLimitResult }> {
  const ip = getClientIp(request);
  const signal = await checkRateLimit(AUTH_RISK_CONFIG, ip);
  return {
    requireCaptcha: signal.allowed === false,
    signal,
  };
}

export function authCaptchaConfigured(): boolean {
  const turnstile = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hcaptcha = process.env.HCAPTCHA_SECRET_KEY?.trim();
  return Boolean(turnstile || hcaptcha);
}
