import { NextRequest } from "next/server";
import {
  decodeJwtPayload,
  handleApiError,
  requireAuthInApi,
  resolveRequestAccessToken,
  resolveSessionAuthTimeSeconds,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashDeviceKey } from "@/lib/auth/auth-security-db";
import { getProviderProtectionPolicy } from "@/lib/auth/provider-security";
import { readDeviceKeyFromRequest, trustCurrentDevice } from "@/lib/auth/trust-device";
import { readAmr } from "@/lib/auth/security-codes";
import { deliverableEmail } from "@/lib/notifications/security-notifications";

const FIRST_DEVICE_ACCOUNT_AGE_HOURS = 24;

/**
 * Tries to verify the current session without user interaction. Returns
 * `{ status: "trusted" }` or `{ status: "verification_required", methods }`.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const token = await resolveRequestAccessToken(request);
    const payload = token ? decodeJwtPayload(token) : null;
    const aal = typeof payload?.aal === "string" ? payload.aal : null;
    const methods = readAmr(payload).map((e) => e.method);
    const policy = await getProviderProtectionPolicy();
    const admin = getSupabaseAdmin();
    const trusted = async (reason: string, limitedHours?: number) => {
      await trustCurrentDevice(request, user.id, reason, limitedHours ? { limitedHours } : undefined);
      return successResponse({ status: "trusted", reason });
    };

    const deviceKey = await readDeviceKeyFromRequest(request);
    if (deviceKey) {
      const { data: device } = await admin
        .from("user_trusted_devices")
        .select("id, trusted_until, revoked_at")
        .eq("user_id", user.id)
        .eq("device_key_hash", hashDeviceKey(deviceKey))
        .maybeSingle();
      const d = device as { trusted_until: string | null; revoked_at: string | null } | null;
      if (d && !d.revoked_at && d.trusted_until && new Date(d.trusted_until).getTime() > Date.now()) {
        return trusted("known_device");
      }
    }

    if (aal === "aal2") return trusted("totp_session");
    if (methods.includes("oauth") || methods.includes("sso/saml")) return trusted("oauth");
    // Signing in with an emailed link/code or a password-reset link proves inbox access.
    if (methods.includes("magiclink") || methods.includes("recovery") || methods.includes("invite")) {
      return trusted("email_link");
    }
    if (methods.includes("otp")) {
      // Phone OTP is weaker (SIM swap): trust, but keep money actions locked for a while.
      return user.phone ? trusted("sms_otp", policy.limited_trust_hours) : trusted("email_otp");
    }

    if (policy.rollout_started_at && token) {
      const authTime = resolveSessionAuthTimeSeconds(token);
      const rollout = Math.floor(new Date(policy.rollout_started_at).getTime() / 1000);
      if (authTime !== null && authTime < rollout) return trusted("pre_rollout");
    }

    const { count } = await admin
      .from("user_trusted_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .not("trusted_until", "is", null);
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    const accountAgeHours = (Date.now() - createdAt) / 3_600_000;
    if ((count ?? 0) === 0 && accountAgeHours < FIRST_DEVICE_ACCOUNT_AGE_HOURS) {
      return trusted("first_device");
    }

    return successResponse({
      status: "verification_required",
      methods: deliverableEmail(user.email) ? ["email_code"] : user.phone ? ["sms_signin"] : [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
