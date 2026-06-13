import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { sendShadowAccountClaimInvite } from "@/lib/auth/claim-shadow-account";
import { checkPortalRateLimit } from "@/lib/rate-limit/portal";

const claimStartSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/claim/start
 *
 * Enumeration-safe: always returns success. Sends claim invite only for shadow accounts.
 */
export async function POST(request: NextRequest) {
  const rate = await checkPortalRateLimit(request);
  if (!rate.allowed) {
    return errorResponse("Too many requests. Please try again later.", "RATE_LIMITED", 429);
  }

  try {
    const body = await request.json();
    const parsed = claimStartSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Valid email is required", "VALIDATION_ERROR", 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    await sendShadowAccountClaimInvite({
      supabaseAdmin,
      email: parsed.data.email,
    });

    return successResponse({
      message:
        "If we find bookings under this email, we will send instructions to claim your account.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to process claim request");
  }
}
