import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncUserSecurityStateFromFactors } from "@/lib/auth/auth-security-db";
import { hashRecoveryCode } from "@/lib/auth/recovery-codes";
import { checkRateLimit } from "@/lib/rate-limit/store";
import { readSessionIdFromRequest, trustCurrentDevice } from "@/lib/auth/trust-device";
import { clearProviderSecurityAllowedCache } from "@/lib/auth/provider-security";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * Lost authenticator: a valid recovery code (password session, aal1) removes the user's TOTP
 * factors so they can sign in and set up a new authenticator. Each code works once.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const limited = await checkRateLimit({ prefix: "mfa-recover", limit: 5, windowSeconds: 15 * 60 }, user.id);
    if (!limited.allowed) {
      return handleApiError(
        Object.assign(new Error("Too many attempts. Try again in a few minutes."), {
          status: 429,
          code: "RATE_LIMITED",
          details: { retry_after_seconds: limited.retryAfterSeconds ?? 60 },
        }),
      );
    }

    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const admin = getSupabaseAdmin();
    const { data: row } = await admin
      .from("user_mfa_recovery_codes")
      .select("id")
      .eq("user_id", user.id)
      .eq("code_hash", hashRecoveryCode(body.code ?? ""))
      .is("used_at", null)
      .maybeSingle();
    if (!row) {
      return handleApiError(
        Object.assign(new Error("That recovery code isn't valid or was already used."), {
          status: 400,
          code: "INVALID_RECOVERY_CODE",
        }),
      );
    }

    const { data: claimed } = await admin
      .from("user_mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", (row as { id: string }).id)
      .is("used_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) {
      return handleApiError(
        Object.assign(new Error("That recovery code was already used."), {
          status: 400,
          code: "INVALID_RECOVERY_CODE",
        }),
      );
    }

    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    for (const f of factors?.factors ?? []) {
      if (f.factor_type === "totp") {
        await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
      }
    }
    await syncUserSecurityStateFromFactors(admin, user.id);
    await admin.from("user_mfa_recovery_codes").delete().eq("user_id", user.id);
    await trustCurrentDevice(request, user.id, "recovery_code");
    const sessionId = await readSessionIdFromRequest(request);
    if (sessionId) clearProviderSecurityAllowedCache(sessionId, user.id);

    await sendSecurityAlert({
      key: "security_recovery_code_used",
      userId: user.id,
      eventId: `recovery_used:${(row as { id: string }).id}`,
    });
    const meta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      action: "auth.mfa.recovery_code_used",
      entity_type: "user",
      entity_id: user.id,
      module: "auth_security",
      metadata: { factors_removed: (factors?.factors ?? []).filter((f) => f.factor_type === "totp").length },
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    }).catch(() => undefined);

    return successResponse({ ok: true, mfa_removed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
