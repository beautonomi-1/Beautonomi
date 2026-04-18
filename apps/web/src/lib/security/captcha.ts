/**
 * §15.4 (audit 2026-04) — CAPTCHA guard for public booking surfaces.
 *
 * Feature-flagged:
 *   - Enforced only when `TURNSTILE_SECRET_KEY` (or `HCAPTCHA_SECRET_KEY`)
 *     is set in the env. Without it, `verifyPublicBookingCaptcha` always
 *     returns `{ ok: true }` so local / preview environments don't need
 *     Cloudflare configured.
 *
 * Wave 1.5 (audit 2026-04 final 100/100):
 *   The previous implementation auto-bypassed CAPTCHA whenever a request
 *   carried a Supabase auth cookie or `Authorization: Bearer` header.
 *   That made the guard trivially defeatable: any attacker who creates
 *   one cheap throwaway account can mint a session and then bot-spam
 *   booking-create, booking-hold, and OTP endpoints with zero CAPTCHA
 *   friction. Removed the session-based bypass so CAPTCHA is enforced
 *   for *every* anonymous-or-quasi-anonymous public surface that calls
 *   this helper. Callers that genuinely need to skip CAPTCHA for
 *   first-party logged-in clients should pass `skipForUserId` only when
 *   they have already verified the user via Supabase server auth — never
 *   from a raw header.
 *
 * Supported providers (in priority order):
 *   1. Cloudflare Turnstile (`TURNSTILE_SECRET_KEY`)
 *   2. hCaptcha              (`HCAPTCHA_SECRET_KEY`)
 *
 * The route expects either:
 *   - a request header `X-Captcha-Token`, OR
 *   - a JSON body field `captcha_token`.
 */

import type { NextRequest } from "next/server";

export type CaptchaCheckResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };

export interface CaptchaOptions {
  /**
   * Optional explicit allow-list: pass an authenticated user UUID that
   * the caller has already validated server-side via Supabase auth.
   * NEVER derive this from a raw cookie or Bearer header.
   */
  skipForUserId?: string | null;
}

export async function verifyPublicBookingCaptcha(
  request: NextRequest,
  bodyJson: unknown,
  options: CaptchaOptions = {},
): Promise<CaptchaCheckResult> {
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY?.trim();

  if (!turnstileSecret && !hcaptchaSecret) {
    // Feature off — no-op so existing flows (dev, preview, first-party
    // checkout) continue to work unchanged until ops turn the guard on.
    const result: CaptchaCheckResult = { ok: true };
    return result;
  }

  // Wave 1.5: ONLY skip CAPTCHA when the caller has already verified the
  // user against Supabase server auth and explicitly passed the user id.
  // Mere presence of a cookie or Bearer header is not a proof of
  // identity for an account-creation-friendly Supabase project.
  if (options.skipForUserId && options.skipForUserId.trim().length > 0) {
    return { ok: true };
  }

  const headerToken = request.headers.get("x-captcha-token")?.trim();
  const bodyToken =
    bodyJson && typeof bodyJson === "object"
      ? (bodyJson as Record<string, unknown>).captcha_token
      : undefined;
  const token =
    headerToken ||
    (typeof bodyToken === "string" ? bodyToken.trim() : "");

  if (!token) {
    return {
      ok: false,
      status: 400,
      reason: "CAPTCHA token is required for anonymous bookings.",
    };
  }

  // Use the remote IP (best-effort) as an additional signal — Turnstile /
  // hCaptcha both accept it as a verification input.
  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";

  try {
    if (turnstileSecret) {
      const form = new URLSearchParams();
      form.set("secret", turnstileSecret);
      form.set("response", token);
      if (remoteIp) form.set("remoteip", remoteIp);
      const r = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        { method: "POST", body: form },
      );
      const json = (await r.json().catch(() => ({}))) as {
        success?: boolean;
        "error-codes"?: string[];
      };
      if (json.success) return { ok: true };
      return {
        ok: false,
        status: 400,
        reason: `CAPTCHA verification failed${
          json["error-codes"] ? `: ${json["error-codes"].join(",")}` : ""
        }`,
      };
    }

    if (hcaptchaSecret) {
      const form = new URLSearchParams();
      form.set("secret", hcaptchaSecret);
      form.set("response", token);
      if (remoteIp) form.set("remoteip", remoteIp);
      const r = await fetch("https://hcaptcha.com/siteverify", {
        method: "POST",
        body: form,
      });
      const json = (await r.json().catch(() => ({}))) as {
        success?: boolean;
        "error-codes"?: string[];
      };
      if (json.success) return { ok: true };
      return {
        ok: false,
        status: 400,
        reason: `CAPTCHA verification failed${
          json["error-codes"] ? `: ${json["error-codes"].join(",")}` : ""
        }`,
      };
    }
  } catch (err) {
    console.warn("[captcha] verification threw:", err);
    return {
      ok: false,
      status: 503,
      reason: "CAPTCHA verification unavailable, please retry.",
    };
  }

  return { ok: true };
}
