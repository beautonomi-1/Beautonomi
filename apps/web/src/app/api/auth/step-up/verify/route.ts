import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  decodeJwtPayload,
  handleApiError,
  requireAuthInApi,
  resolveRequestAccessToken,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { verifyCurrentPasswordForUser } from "@/lib/auth/verify-current-password";
import { clearProviderSecurityAllowedCache, getProviderProtectionPolicy } from "@/lib/auth/provider-security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasRecentAmr, verifySecurityCode } from "@/lib/auth/security-codes";
import { checkRateLimit } from "@/lib/rate-limit/store";

type StepUpMethod = "totp" | "code" | "password" | "sms_signin";

function failed(message: string, code = "STEP_UP_FAILED", status = 400, details?: unknown): Error {
  return Object.assign(new Error(message), { status, code, details });
}

/**
 * Records a short-lived step-up grant for the current session. Failures use
 * STEP_UP_FAILED / INVALID_CODE (never STEP_UP_REQUIRED) so clients don't re-open the prompt in a loop.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = (await request.json().catch(() => ({}))) as {
      method?: StepUpMethod;
      password?: string;
      challenge_id?: string;
      code?: string;
    };
    const method: StepUpMethod = body.method ?? "password";
    const policy = await getProviderProtectionPolicy();
    const token = await resolveRequestAccessToken(request);
    const payload = token ? decodeJwtPayload(token) : null;
    const sessionId = typeof payload?.session_id === "string" ? payload.session_id : null;
    if (!sessionId) {
      throw failed("Your session couldn't be confirmed. Sign in again.", "STEP_UP_FAILED", 401);
    }

    if (method === "totp") {
      if (!hasRecentAmr(payload, ["totp"], policy.step_up_window_seconds)) {
        throw failed("Enter a code from your authenticator app first.");
      }
    } else if (method === "sms_signin") {
      if (!hasRecentAmr(payload, ["otp"], policy.step_up_window_seconds)) {
        throw failed("Confirm the code we texted you first.");
      }
    } else if (method === "code") {
      if (!body.challenge_id || !body.code) throw failed("Enter the 6-digit code.", "VALIDATION_ERROR");
      await verifySecurityCode({
        userId: user.id,
        challengeId: body.challenge_id,
        code: body.code,
        purpose: "step_up",
      });
    } else if (method === "password") {
      const limited = await checkRateLimit(
        { prefix: "step-up-password", limit: 5, windowSeconds: 15 * 60 },
        user.id,
      );
      if (!limited.allowed) {
        throw failed("Too many attempts. Try again in a few minutes or use an email code.", "RATE_LIMITED", 429, {
          retry_after_seconds: limited.retryAfterSeconds ?? 60,
        });
      }
      const supabase = await getSupabaseServer(request);
      const ok = body.password
        ? await verifyCurrentPasswordForUser(supabase, user, body.password)
        : false;
      if (!ok) throw failed("That password isn't right.", "INVALID_PASSWORD");
    } else {
      throw failed("Unsupported verification method.", "VALIDATION_ERROR");
    }

    const expires = new Date(Date.now() + policy.step_up_window_seconds * 1000);
    const { error } = await getSupabaseAdmin().from("auth_step_up_grants").insert({
      user_id: user.id,
      session_id: sessionId,
      method,
      expires_at: expires.toISOString(),
    });
    if (error) throw error;
    clearProviderSecurityAllowedCache(sessionId, user.id);
    return successResponse({ ok: true, expires_at: expires.toISOString() });
  } catch (error) {
    return handleApiError(error);
  }
}
