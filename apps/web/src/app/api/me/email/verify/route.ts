import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";
import { isMailableEmail } from "@beautonomi/utils";

/**
 * POST /api/me/email/verify
 *
 * Marks the user's email as verified by reading Supabase Auth's own
 * `email_confirmed_at` field — which is only set after a successful
 * `verifyOtp({ type: "email_change" | "email" | "signup" })` on the client,
 * or after an OAuth sign-in where the provider already confirmed the address.
 *
 * This is the ONLY server path that writes `email_verified = true` to
 * `users`. The PATCH /api/me/profile endpoint intentionally does NOT
 * accept email_verified from the request body to prevent spoofing.
 *
 * The client should call this immediately after a successful
 * `supabase.auth.verifyOtp({ type: "email_change" })` call, or during
 * onboarding auto-detect when email_confirmed_at is already set.
 *
 * Body (all optional):
 *   email?: string  — new email to also store in users.email (must match confirmed auth email)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );

    await bootstrapPreferredHomeTenantForAuthedUser(user.id, request);

    const supabase = await getSupabaseServer(request);

    // Read Supabase Auth's own user record — email_confirmed_at is only
    // populated after a successful verifyOtp call or OAuth confirmation.
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return errorResponse("Unable to verify auth state", "AUTH_ERROR", 401);
    }

    const emailConfirmedAt = authUser.email_confirmed_at;

    if (!emailConfirmedAt) {
      return errorResponse(
        "Email address has not been verified via OTP. Complete the email verification first.",
        "EMAIL_NOT_VERIFIED",
        400
      );
    }

    // The email that Supabase Auth has confirmed.
    const confirmedEmail = authUser.email?.trim();
    if (!confirmedEmail || !isMailableEmail(confirmedEmail)) {
      return errorResponse(
        "Confirmed email is not a valid mailable address.",
        "EMAIL_NOT_MAILABLE",
        400
      );
    }

    const body = await request.json().catch(() => ({})) as { email?: string };

    // If the client supplied an email, it must match what Auth confirmed (anti-spoof).
    if (body.email) {
      const candidate = body.email.trim().toLowerCase();
      if (candidate !== confirmedEmail.toLowerCase()) {
        return errorResponse(
          "Supplied email does not match the confirmed auth email.",
          "EMAIL_MISMATCH",
          400
        );
      }
    }

    const updates: Record<string, unknown> = {
      email_verified: true,
      email: confirmedEmail,
    };

    const { error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id);

    if (updateError) throw updateError;

    return successResponse({ verified: true, email: confirmedEmail });
  } catch (error) {
    return handleApiError(error, "Failed to confirm email verification");
  }
}
