/**
 * §15.4 (audit 2026-04) — CAPTCHA guard for public booking creation.
 *
 * Feature-flagged:
 *   - Enforced only when `TURNSTILE_SECRET_KEY` is set in the env.
 *     Without it, `verifyPublicBookingCaptcha` always returns `{ ok: true }`
 *     so local / preview environments don't need Cloudflare configured.
 *   - Additionally, authenticated callers skip the CAPTCHA — the relevant
 *     threat model is anonymous bot abuse of POST /api/public/bookings.
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

export async function verifyPublicBookingCaptcha(
  request: NextRequest,
  bodyJson: unknown,
): Promise<CaptchaCheckResult> {
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY?.trim();

  if (!turnstileSecret && !hcaptchaSecret) {
    // Feature off — no-op so existing flows (dev, preview, first-party
    // checkout) continue to work unchanged until ops turn the guard on.
    const result: CaptchaCheckResult = { ok: true };
    return result;
  }

  // Skip CAPTCHA for authenticated callers. The primary abuse surface is
  // anonymous bookings; logged-in users are already rate-limited and
  // identifiable.
  const authHeader = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie");
  const hasSbSession =
    (cookieHeader && /sb[-_:][^=]*auth-token/.test(cookieHeader)) ||
    (authHeader && authHeader.toLowerCase().startsWith("bearer "));
  if (hasSbSession) return { ok: true };

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
