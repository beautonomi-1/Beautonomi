import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import {
  getProviderProtectionPolicy,
  isProviderSecuritySubject,
  resolveSessionSecurityContext,
} from "@/lib/auth/provider-security";
import { syncUserSecurityStateFromFactors } from "@/lib/auth/auth-security-db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAppReviewDemoUserId } from "@/lib/auth/app-review-demo";
import { deliverableEmail, maskEmail } from "@/lib/notifications/security-notifications";

const FACTOR_SYNC_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * What the signed-in provider session still needs: `ok`, `mfa_required` (TOTP at sign-in)
 * or `device_required` (new-device check). Non-provider callers always get `ok`.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const admin = getSupabaseAdmin();

    const { data: roleRow } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
    const role = (roleRow as { role?: string | null } | null)?.role ?? null;
    const applies = isProviderSecuritySubject(request, role) && !isAppReviewDemoUserId(user.id);

    const { data: stateRow } = await admin
      .from("user_security_state")
      .select("updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    const syncedAt = (stateRow as { updated_at?: string } | null)?.updated_at;
    const forceSync = request.nextUrl.searchParams.get("sync") === "1";
    if (forceSync || !syncedAt || Date.now() - new Date(syncedAt).getTime() > FACTOR_SYNC_MAX_AGE_MS) {
      await syncUserSecurityStateFromFactors(admin, user.id);
    }

    const ctx = await resolveSessionSecurityContext(request, user.id, { fresh: true });
    const policy = await getProviderProtectionPolicy();
    const email = deliverableEmail(user.email);

    const stepUpMethods: string[] = [];
    if (ctx.hasVerifiedTotp) stepUpMethods.push("totp");
    if (email) stepUpMethods.push("code");
    stepUpMethods.push("password");
    if (!email && user.phone) stepUpMethods.push("sms_signin");

    let status: "ok" | "mfa_required" | "device_required" = "ok";
    if (applies && !ctx.isImpersonation) {
      if (ctx.hasVerifiedTotp && ctx.aal !== "aal2") status = "mfa_required";
      else if (policy.device_verification === "enforce" && !ctx.deviceVerified) status = "device_required";
    }

    return successResponse({
      status,
      applies,
      mfa: {
        enrolled: ctx.hasVerifiedTotp,
        satisfied: ctx.aal === "aal2" || !ctx.hasVerifiedTotp,
      },
      device: {
        verified: ctx.deviceVerified,
        limited_until: ctx.deviceLimitedUntil,
        methods: email ? ["email_code"] : user.phone ? ["sms_signin"] : [],
      },
      step_up_methods: stepUpMethods,
      masked_email: email ? maskEmail(email) : null,
      has_phone: Boolean(user.phone),
      policy: {
        step_up: policy.step_up,
        device_verification: policy.device_verification,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
