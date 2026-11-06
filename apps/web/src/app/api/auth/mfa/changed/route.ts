import { NextRequest } from "next/server";
import {
  decodeJwtPayload,
  handleApiError,
  requireAuthInApi,
  resolveRequestAccessToken,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncUserSecurityStateFromFactors } from "@/lib/auth/auth-security-db";
import { trustCurrentDevice } from "@/lib/auth/trust-device";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * Called by clients after enrolling or removing an authenticator. Re-reads factors from
 * Supabase (source of truth), so the body is only a hint for which alert to send.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = (await request.json().catch(() => ({}))) as { event?: "enrolled" | "unenrolled" };
    const admin = getSupabaseAdmin();

    const { data: before } = await admin
      .from("user_security_state")
      .select("has_verified_totp")
      .eq("user_id", user.id)
      .maybeSingle();
    const hadTotp = Boolean((before as { has_verified_totp?: boolean } | null)?.has_verified_totp);

    await syncUserSecurityStateFromFactors(admin, user.id);
    const { data: after } = await admin
      .from("user_security_state")
      .select("has_verified_totp")
      .eq("user_id", user.id)
      .maybeSingle();
    const hasTotp = Boolean((after as { has_verified_totp?: boolean } | null)?.has_verified_totp);

    const token = await resolveRequestAccessToken(request);
    const payload = token ? decodeJwtPayload(token) : null;
    const sessionId = typeof payload?.session_id === "string" ? payload.session_id : "none";

    if (hasTotp && !hadTotp) {
      if (payload?.aal === "aal2") await trustCurrentDevice(request, user.id, "totp_enrolled");
      await sendSecurityAlert({
        key: "security_mfa_enabled",
        userId: user.id,
        eventId: `mfa_enabled:${user.id}:${sessionId}:${Date.now()}`,
      });
    } else if (!hasTotp && hadTotp) {
      await admin.from("user_mfa_recovery_codes").delete().eq("user_id", user.id);
      await sendSecurityAlert({
        key: "security_mfa_disabled",
        userId: user.id,
        eventId: `mfa_disabled:${user.id}:${sessionId}:${Date.now()}`,
      });
    }

    if (hasTotp !== hadTotp) {
      const meta = extractRequestMeta(request);
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: null,
        action: hasTotp ? "auth.mfa.enrolled" : "auth.mfa.unenrolled",
        entity_type: "user",
        entity_id: user.id,
        module: "auth_security",
        metadata: { hint: body.event ?? null },
        ip_address: meta.ip_address,
        user_agent: meta.user_agent,
      }).catch(() => undefined);
    }

    return successResponse({ enrolled: hasTotp });
  } catch (error) {
    return handleApiError(error);
  }
}
