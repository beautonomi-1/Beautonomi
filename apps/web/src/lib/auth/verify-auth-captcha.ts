import type { NextRequest } from "next/server";
import {
  verifyPublicBookingCaptcha,
  type CaptchaCheckResult,
} from "@/lib/security/captcha";

const GENERIC_CAPTCHA_FAILURE = "Unable to complete this request. Please try again.";

/**
 * Reuse the booking Turnstile/hCaptcha helper, but never leak provider error codes.
 */
export async function verifyAuthCaptcha(
  request: NextRequest,
  bodyJson: unknown,
): Promise<CaptchaCheckResult> {
  const result = await verifyPublicBookingCaptcha(request, bodyJson);
  if (result.ok === false) {
    return {
      ok: false,
      status: result.status === 503 ? 503 : 400,
      reason: GENERIC_CAPTCHA_FAILURE,
    };
  }
  return result;
}
