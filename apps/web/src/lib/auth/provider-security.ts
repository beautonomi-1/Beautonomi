import type { NextRequest } from "next/server";
import {
  DEVICE_VERIFICATION_REQUIRED,
  IMPERSONATION_RESTRICTED,
  PROVIDER_MFA_REQUIRED,
  SecurityChallengeError,
  STEP_UP_REQUIRED,
} from "@beautonomi/auth-security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decodeJwtPayload, resolveRequestAccessToken } from "@/lib/supabase/api-helpers";
import { isAppReviewDemoUserId } from "@/lib/auth/app-review-demo";
import { rpcProviderSessionSecurity } from "@/lib/auth/auth-security-db";

export type ProviderProtectionMode = "off" | "monitor" | "enforce";

export type ProviderProtectionPolicy = {
  step_up: ProviderProtectionMode;
  device_verification: ProviderProtectionMode;
  step_up_window_seconds: number;
  trusted_device_days: number;
  limited_trust_hours: number;
  rollout_started_at: string | null;
};

const DEFAULT_POLICY: ProviderProtectionPolicy = {
  step_up: "off",
  device_verification: "off",
  step_up_window_seconds: 600,
  trusted_device_days: 180,
  limited_trust_hours: 24,
  rollout_started_at: null,
};

let policyCache: { at: number; policy: ProviderProtectionPolicy } | null = null;
const POLICY_TTL_MS = 30_000;

export async function getProviderProtectionPolicy(): Promise<ProviderProtectionPolicy> {
  const now = Date.now();
  if (policyCache && now - policyCache.at < POLICY_TTL_MS) {
    return policyCache.policy;
  }
  try {
    const { data: row } = await getSupabaseAdmin()
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const settings = (row as { settings?: Record<string, unknown> } | null)?.settings ?? {};
    const security = (settings.security as Record<string, unknown> | undefined) ?? {};
    const pp = (security.provider_protection as Record<string, unknown> | undefined) ?? {};
    const mode = (v: unknown): ProviderProtectionMode =>
      v === "monitor" || v === "enforce" ? v : "off";
    const policy: ProviderProtectionPolicy = {
      step_up: mode(pp.step_up),
      device_verification: mode(pp.device_verification),
      step_up_window_seconds:
        typeof pp.step_up_window_seconds === "number" && pp.step_up_window_seconds > 0
          ? pp.step_up_window_seconds
          : DEFAULT_POLICY.step_up_window_seconds,
      trusted_device_days:
        typeof pp.trusted_device_days === "number" && pp.trusted_device_days > 0
          ? pp.trusted_device_days
          : DEFAULT_POLICY.trusted_device_days,
      limited_trust_hours:
        typeof pp.limited_trust_hours === "number" && pp.limited_trust_hours > 0
          ? pp.limited_trust_hours
          : DEFAULT_POLICY.limited_trust_hours,
      rollout_started_at:
        typeof pp.rollout_started_at === "string" ? pp.rollout_started_at : null,
    };
    policyCache = { at: now, policy };
    return policy;
  } catch {
    return DEFAULT_POLICY;
  }
}

export type SessionSecurityContext = {
  sessionId: string | null;
  aal: string | null;
  hasVerifiedTotp: boolean;
  deviceVerified: boolean;
  deviceLimitedUntil: string | null;
  stepUpGrantUntil: string | null;
  isImpersonation: boolean;
  recentTotpAt: number | null;
};

type SessionSecurityRow = Pick<
  SessionSecurityContext,
  "hasVerifiedTotp" | "deviceVerified" | "deviceLimitedUntil" | "stepUpGrantUntil" | "isImpersonation"
>;

/** Per-instance cache of the session security row, only for sessions that passed the gate. */
const allowedCache = new Map<string, { at: number; row: SessionSecurityRow }>();
const ALLOWED_TTL_MS = 60_000;
const ALLOWED_CACHE_MAX = 5_000;

function parseSessionId(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const sid = payload?.session_id;
  return typeof sid === "string" ? sid : null;
}

function parseAal(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const aal = payload?.aal;
  return typeof aal === "string" ? aal : null;
}

function recentTotpFromToken(token: string, windowSeconds: number): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || !Array.isArray(payload.amr)) return null;
  const now = Math.floor(Date.now() / 1000);
  for (const entry of payload.amr as Array<{ method?: unknown; timestamp?: unknown }>) {
    if (entry?.method === "totp" && typeof entry.timestamp === "number") {
      if (now - entry.timestamp <= windowSeconds) return entry.timestamp;
    }
  }
  return null;
}

export async function resolveSessionSecurityContext(
  request: NextRequest | Request,
  userId: string,
  options?: { fresh?: boolean },
): Promise<SessionSecurityContext> {
  const token = await resolveRequestAccessToken(request);
  const sessionId = token ? parseSessionId(token) : null;
  const aal = token ? parseAal(token) : null;
  const policy = await getProviderProtectionPolicy();
  const recentTotpAt = token ? recentTotpFromToken(token, policy.step_up_window_seconds) : null;

  if (sessionId && !options?.fresh) {
    const cached = allowedCache.get(`${sessionId}:${userId}`);
    if (cached && Date.now() - cached.at < ALLOWED_TTL_MS) {
      return { sessionId, aal, recentTotpAt, ...cached.row };
    }
  }

  if (aal === "aal2" && !sessionId) {
    return {
      sessionId,
      aal,
      hasVerifiedTotp: true,
      deviceVerified: true,
      deviceLimitedUntil: null,
      stepUpGrantUntil: null,
      isImpersonation: false,
      recentTotpAt,
    };
  }

  if (!sessionId) {
    return {
      sessionId: null,
      aal,
      hasVerifiedTotp: false,
      deviceVerified: false,
      deviceLimitedUntil: null,
      stepUpGrantUntil: null,
      isImpersonation: false,
      recentTotpAt,
    };
  }

  try {
    const rpc = await rpcProviderSessionSecurity(userId, sessionId);
    const ctx: SessionSecurityContext = {
      sessionId,
      aal,
      hasVerifiedTotp: rpc.has_verified_totp,
      deviceVerified: rpc.session_verified,
      deviceLimitedUntil: rpc.device_limited_until,
      stepUpGrantUntil: rpc.step_up_grant_expires_at,
      isImpersonation: rpc.is_impersonation,
      recentTotpAt,
    };
    return ctx;
  } catch (err) {
    // Fail open on infrastructure errors: password auth already passed and every
    // sensitive write still requires step-up when the RPC recovers.
    console.error("[provider-security] session security lookup failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      sessionId,
      aal,
      hasVerifiedTotp: false,
      deviceVerified: true,
      deviceLimitedUntil: null,
      stepUpGrantUntil: null,
      isImpersonation: false,
      recentTotpAt,
    };
  }
}

function rememberAllowed(userId: string, ctx: SessionSecurityContext): void {
  if (!ctx.sessionId) return;
  if (allowedCache.size >= ALLOWED_CACHE_MAX) {
    const oldest = allowedCache.keys().next().value;
    if (oldest) allowedCache.delete(oldest);
  }
  allowedCache.set(`${ctx.sessionId}:${userId}`, {
    at: Date.now(),
    row: {
      hasVerifiedTotp: ctx.hasVerifiedTotp,
      deviceVerified: ctx.deviceVerified,
      deviceLimitedUntil: ctx.deviceLimitedUntil,
      stepUpGrantUntil: ctx.stepUpGrantUntil,
      isImpersonation: ctx.isImpersonation,
    },
  });
}

function isProviderRole(role: string | null | undefined): boolean {
  return role === "provider_owner" || role === "provider_staff";
}

/** Whether provider protections apply to this caller at all (role + app surface), independent of route. */
export function isProviderSecuritySubject(
  request: NextRequest | Request,
  role: string | null | undefined,
): boolean {
  if (!isProviderRole(role)) return false;
  if (request.headers.get("X-App") === "customer") return false;
  return true;
}

function providerApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/provider/")) return false;
  if (pathname.startsWith("/api/provider/staff/join/")) return false;
  if (pathname.startsWith("/api/provider/onboarding")) return false;
  if (pathname === "/api/provider/devices" || pathname.startsWith("/api/provider/devices/")) return false;
  return true;
}

export function shouldApplyProviderSessionSecurity(
  request: NextRequest | Request,
  role: string | null | undefined,
): boolean {
  if (!isProviderSecuritySubject(request, role)) return false;
  let pathname = "";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return false;
  }
  if (!providerApiPath(pathname)) return false;
  return true;
}

async function auditWouldBlock(
  request: NextRequest | Request,
  userId: string,
  role: string,
  kind: string,
): Promise<void> {
  try {
    const { writeAuditLog, extractRequestMeta } = await import("@/lib/audit/audit");
    const meta = extractRequestMeta(request);
    const token = await resolveRequestAccessToken(request);
    const payload = token ? decodeJwtPayload(token) : null;
    await writeAuditLog({
      actor_user_id: userId,
      actor_role: role,
      action: "provider.security.would_block",
      entity_type: "user",
      entity_id: userId,
      module: "auth_security",
      metadata: {
        kind,
        route: new URL(request.url).pathname,
        amr: payload?.amr ?? null,
      },
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    });
  } catch {
    // best-effort
  }
}

export async function requireProviderSessionSecurity(
  request: NextRequest | Request,
  userId: string,
  role: string,
): Promise<void> {
  if (!shouldApplyProviderSessionSecurity(request, role)) return;
  if (isAppReviewDemoUserId(userId)) return;

  const ctx = await resolveSessionSecurityContext(request, userId);
  const policy = await getProviderProtectionPolicy();

  if (ctx.isImpersonation) return;

  if (ctx.hasVerifiedTotp && ctx.aal !== "aal2") {
    throw new SecurityChallengeError(
      "Complete two-step verification to continue.",
      PROVIDER_MFA_REQUIRED,
      { methods: ["totp"] },
    );
  }

  if (policy.device_verification === "enforce" && !ctx.deviceVerified) {
    throw new SecurityChallengeError(
      "Verify this device to continue.",
      DEVICE_VERIFICATION_REQUIRED,
      { methods: ["email_code", "approve_device"] },
    );
  }

  if (policy.device_verification === "monitor" && !ctx.deviceVerified) {
    void auditWouldBlock(request, userId, role, "device_verification");
  }

  rememberAllowed(userId, ctx);
}

const MONEY_ACTIONS = new Set([
  "payout_account",
  "stripe_connect",
  "payout_transfer",
]);

export async function requireStepUp(
  request: NextRequest | Request,
  userId: string,
  role: string,
  options: { action: string },
): Promise<void> {
  if (!isProviderSecuritySubject(request, role)) return;
  if (isAppReviewDemoUserId(userId)) return;

  const ctx = await resolveSessionSecurityContext(request, userId, { fresh: true });
  if (ctx.isImpersonation) {
    throw new SecurityChallengeError(
      "Bank, contact and team changes can't be made while impersonating. Use the admin tools.",
      IMPERSONATION_RESTRICTED,
    );
  }

  const policy = await getProviderProtectionPolicy();
  if (policy.step_up === "off") return;

  if (
    ctx.deviceLimitedUntil &&
    MONEY_ACTIONS.has(options.action) &&
    new Date(ctx.deviceLimitedUntil).getTime() > Date.now()
  ) {
    if (policy.step_up === "monitor") {
      void auditWouldBlock(request, userId, role, `device_too_new:${options.action}`);
      return;
    }
    throw new SecurityChallengeError(
      "For your security, bank and team changes are temporarily unavailable on this device.",
      STEP_UP_REQUIRED,
      {
        action: options.action,
        reason: "device_too_new",
        available_at: ctx.deviceLimitedUntil,
        methods: [],
      },
    );
  }

  const token = await resolveRequestAccessToken(request);
  if (recentTotpFromToken(token ?? "", policy.step_up_window_seconds)) return;
  if (ctx.stepUpGrantUntil && new Date(ctx.stepUpGrantUntil).getTime() > Date.now()) return;

  if (policy.step_up === "monitor") {
    void auditWouldBlock(request, userId, role, `step_up:${options.action}`);
    return;
  }

  throw new SecurityChallengeError("Confirm it's you to continue.", STEP_UP_REQUIRED, {
    action: options.action,
    methods: await resolveStepUpMethods(userId, ctx.hasVerifiedTotp),
  });
}

/** Only offer methods this user can actually complete (phone-only accounts have no email code). */
async function resolveStepUpMethods(userId: string, hasTotp: boolean): Promise<string[]> {
  const methods: string[] = hasTotp ? ["totp"] : [];
  let email: string | null = null;
  let phone: string | null = null;
  try {
    const { data } = await getSupabaseAdmin().auth.admin.getUserById(userId);
    email = data.user?.email ?? null;
    phone = data.user?.phone || null;
  } catch {
    email = "unknown";
  }
  const hasEmail = Boolean(email) && !/@phone\.local$/i.test(email ?? "");
  if (hasEmail) methods.push("code");
  else if (phone) methods.push("sms_signin");
  methods.push("password");
  return methods;
}

export function clearProviderSecurityAllowedCache(sessionId: string, userId: string): void {
  allowedCache.delete(`${sessionId}:${userId}`);
}
