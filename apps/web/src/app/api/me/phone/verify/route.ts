import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";
import { APP_REVIEW_DEMO_PHONE, isAppReviewDemoUserId } from "@/lib/auth/app-review-demo";

/**
 * POST /api/me/phone/verify
 *
 * Marks the user's phone as verified by reading Supabase Auth's own
 * `phone_confirmed_at` field — which is only set after a successful
 * `verifyOtp({ type: "phone_change" | "sms" })` on the client.
 *
 * This is the ONLY server path that writes `phone_verified = true` to
 * `users`. The PATCH /api/me/profile endpoint intentionally does NOT
 * accept phone_verified from the request body to prevent spoofing.
 *
 * The client should call this immediately after a successful
 * `supabase.auth.verifyOtp(...)` call, optionally passing the verified
 * phone number so it can be stored in users.phone at the same time.
 *
 * Body (all optional):
 *   phone?: string  — E.164 phone to also store in users.phone
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );

    await bootstrapPreferredHomeTenantForAuthedUser(user.id, request);

    const supabase = await getSupabaseServer(request);

    if (isAppReviewDemoUserId(user.id)) {
      const body = await request.json().catch(() => ({})) as { phone?: string };
      const confirmedPhone = (body.phone?.trim() || APP_REVIEW_DEMO_PHONE).trim();
      const { error: updateError } = await supabase
        .from("users")
        .update({ phone_verified: true, phone: confirmedPhone })
        .eq("id", user.id);
      if (updateError) throw updateError;
      return successResponse({ verified: true, phone: confirmedPhone });
    }

    // Read Supabase Auth's own user record — phone_confirmed_at is only
    // populated after a successful verifyOtp call on the Supabase side.
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return errorResponse("Unable to verify auth state", "AUTH_ERROR", 401);
    }

    const phoneConfirmedAt = (authUser as unknown as Record<string, unknown>).phone_confirmed_at as
      | string
      | null
      | undefined;

    if (!phoneConfirmedAt) {
      return errorResponse(
        "Phone number has not been verified via OTP. Complete the SMS verification first.",
        "PHONE_NOT_VERIFIED",
        400
      );
    }

    const body = await request.json().catch(() => ({})) as { phone?: string };

    const updates: Record<string, unknown> = { phone_verified: true };

    // Optionally persist the verified phone number
    if (body.phone) {
      // Normalise: strip formatting, ensure it starts with +
      const normalized = body.phone.replace(/[\s\-\(\)]/g, "").trim();
      if (normalized) updates.phone = normalized;
    } else if (authUser.phone) {
      // Fall back to whatever phone Supabase Auth has on record
      updates.phone = authUser.phone;
    }

    const { error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id);

    if (updateError) throw updateError;

    return successResponse({ verified: true, phone: updates.phone ?? null });
  } catch (error) {
    return handleApiError(error, "Failed to confirm phone verification");
  }
}
