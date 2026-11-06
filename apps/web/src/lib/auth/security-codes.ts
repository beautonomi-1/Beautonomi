import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateNumericCode, hashDeviceKey, hashOtpCode } from "@/lib/auth/auth-security-db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit/store";
import { maskEmail, sendSecurityMessageNow } from "@/lib/notifications/security-notifications";
import type { SecurityNotificationTemplateKey } from "@/lib/notifications/security-notification-copy";
import { readDeviceKeyFromRequest, readSessionIdFromRequest } from "@/lib/auth/trust-device";

export type SecurityCodePurpose = "device_verification" | "step_up";

export const SECURITY_CODE_TTL_MINUTES = 10;
export const SECURITY_CODE_MAX_ATTEMPTS = 5;
const SEND_LIMIT = { limit: 5, windowSeconds: 15 * 60 };

function httpError(message: string, code: string, status: number, details?: unknown): Error {
  return Object.assign(new Error(message), { status, code, details });
}

/** Sends a 6-digit code by email (immediately, not via the notification queue). */
export async function startSecurityCode(input: {
  request: NextRequest | Request;
  userId: string;
  purpose: SecurityCodePurpose;
  templateKey: SecurityNotificationTemplateKey;
  variables?: Record<string, string>;
}): Promise<{ challenge_id: string; expires_at: string; sent_to: string }> {
  const limited = await checkRateLimit(
    { prefix: `security-code-send-${input.purpose}`, ...SEND_LIMIT },
    input.userId,
  );
  if (!limited.allowed) {
    throw httpError(
      "Too many codes requested. Please wait a few minutes and try again.",
      "RATE_LIMITED",
      429,
      { retry_after_seconds: limited.retryAfterSeconds ?? 60 },
    );
  }

  const admin = getSupabaseAdmin();
  const sessionId = await readSessionIdFromRequest(input.request);
  const deviceKey = await readDeviceKeyFromRequest(input.request);

  // Only the newest code for this session + purpose stays valid.
  if (sessionId) {
    await admin
      .from("auth_device_challenges")
      .update({ status: "expired" })
      .eq("user_id", input.userId)
      .eq("session_id", sessionId)
      .eq("purpose", input.purpose)
      .eq("status", "pending");
  }

  const code = generateNumericCode(6);
  const challengeId = randomUUID();
  const expiresAt = new Date(Date.now() + SECURITY_CODE_TTL_MINUTES * 60 * 1000).toISOString();
  const { error } = await admin.from("auth_device_challenges").insert({
    id: challengeId,
    user_id: input.userId,
    session_id: sessionId,
    purpose: input.purpose,
    device_key_hash: deviceKey ? hashDeviceKey(deviceKey) : null,
    code_hash: hashOtpCode(code),
    expires_at: expiresAt,
    status: "pending",
    ip: (() => {
      const ip = getClientIp(input.request);
      return ip === "unknown" ? null : ip;
    })(),
    user_agent: input.request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) throw error;

  const { email } = await sendSecurityMessageNow({
    key: input.templateKey,
    userId: input.userId,
    variables: {
      code,
      expires_minutes: String(SECURITY_CODE_TTL_MINUTES),
      ...(input.variables ?? {}),
    },
  });

  return { challenge_id: challengeId, expires_at: expiresAt, sent_to: maskEmail(email) };
}

/** Verifies a code; throws 400/429 errors with stable codes the clients map to copy. */
export async function verifySecurityCode(input: {
  userId: string;
  challengeId: string;
  code: string;
  purpose: SecurityCodePurpose;
}): Promise<{ sessionId: string | null }> {
  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from("auth_device_challenges")
    .select("id, status, expires_at, attempts, code_hash, session_id, purpose")
    .eq("id", input.challengeId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const r = row as {
    id: string;
    status: string;
    expires_at: string;
    attempts: number | null;
    code_hash: string;
    session_id: string | null;
    purpose: string;
  } | null;

  if (!r || r.purpose !== input.purpose) {
    throw httpError("That code is no longer valid. Request a new one.", "CODE_EXPIRED", 400);
  }
  if (r.status === "denied") {
    throw httpError("Too many incorrect attempts. Request a new code.", "TOO_MANY_ATTEMPTS", 429);
  }
  if (r.status !== "pending" || new Date(r.expires_at).getTime() < Date.now()) {
    throw httpError("That code has expired. Request a new one.", "CODE_EXPIRED", 400);
  }

  const attempts = (r.attempts ?? 0) + 1;
  const ok = hashOtpCode(input.code) === r.code_hash && input.code.replace(/\D/g, "").length === 6;
  if (!ok) {
    const exhausted = attempts >= SECURITY_CODE_MAX_ATTEMPTS;
    await admin
      .from("auth_device_challenges")
      .update({ attempts, ...(exhausted ? { status: "denied" } : {}) })
      .eq("id", r.id);
    if (exhausted) {
      throw httpError("Too many incorrect attempts. Request a new code.", "TOO_MANY_ATTEMPTS", 429, {
        exhausted: true,
      });
    }
    throw httpError("That code isn't right. Check the email and try again.", "INVALID_CODE", 400, {
      attempts_remaining: SECURITY_CODE_MAX_ATTEMPTS - attempts,
    });
  }

  await admin
    .from("auth_device_challenges")
    .update({ status: "approved", attempts })
    .eq("id", r.id)
    .eq("status", "pending");
  return { sessionId: r.session_id };
}

export type AmrEntry = { method: string; timestamp: number };

export function readAmr(payload: Record<string, unknown> | null): AmrEntry[] {
  const amr = payload?.amr;
  if (!Array.isArray(amr)) return [];
  return amr
    .map((e) =>
      e && typeof e === "object"
        ? {
            method: String((e as { method?: unknown }).method ?? ""),
            timestamp: Number((e as { timestamp?: unknown }).timestamp ?? 0),
          }
        : null,
    )
    .filter((e): e is AmrEntry => Boolean(e?.method));
}

/** True when the session was established (or re-verified) by `methods` within `windowSeconds`. */
export function hasRecentAmr(
  payload: Record<string, unknown> | null,
  methods: readonly string[],
  windowSeconds: number,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  return readAmr(payload).some((e) => methods.includes(e.method) && now - e.timestamp <= windowSeconds);
}
