import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkSignInRateLimit } from "@/lib/rate-limit/sign-in";
import {
  APP_REVIEW_DEMO_EMAIL,
  isAppReviewDemoEndpointEnabled,
  isAppReviewDemoIdentifier,
  isAppReviewDemoOtp,
} from "@/lib/auth/app-review-demo";

type VerifyBody = {
  email?: string;
  phone?: string;
  otp?: string;
  token?: string;
};

/**
 * POST /api/auth/app-review/verify-otp
 *
 * App Review demo login: validates the fixed demo identifier + OTP, then issues
 * a Supabase session via admin generateLink + verifyOtp (token_hash).
 */
export async function POST(request: NextRequest) {
  try {
    if (!isAppReviewDemoEndpointEnabled()) {
      return errorResponse("Not available", "NOT_FOUND", 404);
    }

    const rateLimit = await checkSignInRateLimit(request);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) },
        },
      );
    }

    const body = (await request.json().catch(() => ({}))) as VerifyBody;
    const otp = (body.otp ?? body.token ?? "").trim();
    const email = body.email?.trim();
    const phone = body.phone?.trim();

    if (!otp) {
      return errorResponse("Verification code is required", "VALIDATION_ERROR", 400);
    }

    if (!isAppReviewDemoIdentifier({ email, phone })) {
      return errorResponse("Invalid demo account", "INVALID_DEMO_ACCOUNT", 403);
    }

    if (!isAppReviewDemoOtp(otp)) {
      return errorResponse("Invalid verification code", "INVALID_OTP", 401);
    }

    const admin = getSupabaseAdmin();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: APP_REVIEW_DEMO_EMAIL,
    });

    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      console.error("[app-review/verify-otp] generateLink failed:", linkError?.message);
      return errorResponse("Could not start demo session", "SESSION_ERROR", 500);
    }

    let verified = await admin.auth.verifyOtp({
      type: "email",
      token_hash: hashedToken,
    });

    if (verified.error || !verified.data.session) {
      verified = await admin.auth.verifyOtp({
        type: "magiclink",
        token_hash: hashedToken,
      });
    }

    if (verified.error || !verified.data.session) {
      console.error("[app-review/verify-otp] verifyOtp failed:", verified.error?.message);
      return errorResponse("Could not verify demo session", "VERIFY_ERROR", 500);
    }

    const session = verified.data.session;
    return successResponse({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    });
  } catch (error) {
    return handleApiError(error, "App review demo verification failed");
  }
}
