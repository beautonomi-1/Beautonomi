import { NextRequest } from "next/server";
import {
  decodeJwtPayload,
  handleApiError,
  requireAuthInApi,
  resolveRequestAccessToken,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCode,
  hashRecoveryCode,
} from "@/lib/auth/recovery-codes";

/** GET: how many unused codes remain. */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const { count } = await getSupabaseAdmin()
      .from("user_mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("used_at", null);
    return successResponse({ remaining: count ?? 0 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST: replace all recovery codes. Requires a two-step verified (aal2) session. Codes are shown once. */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const token = await resolveRequestAccessToken(request);
    const payload = token ? decodeJwtPayload(token) : null;
    if (payload?.aal !== "aal2") {
      return handleApiError(
        Object.assign(new Error("Enter a code from your authenticator app first."), {
          status: 403,
          code: "MFA_VERIFICATION_REQUIRED",
        }),
      );
    }

    const admin = getSupabaseAdmin();
    const { count: existing } = await admin
      .from("user_mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await admin.from("user_mfa_recovery_codes").delete().eq("user_id", user.id);
    const { error } = await admin
      .from("user_mfa_recovery_codes")
      .insert(codes.map((c) => ({ user_id: user.id, code_hash: hashRecoveryCode(c) })));
    if (error) throw error;

    if ((existing ?? 0) > 0) {
      await sendSecurityAlert({
        key: "security_recovery_codes_regenerated",
        userId: user.id,
        eventId: `recovery_regenerated:${user.id}:${Date.now()}`,
      });
    }
    return successResponse({ codes });
  } catch (error) {
    return handleApiError(error);
  }
}
