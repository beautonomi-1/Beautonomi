import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import {
  sendShadowAccountClaimInvite,
  sendShadowAccountClaimInviteByPhone,
} from "@/lib/auth/claim-shadow-account";
import { checkPortalRateLimit } from "@/lib/rate-limit/portal";
import { normalizePhoneToE164 } from "@/lib/phone";

const claimStartSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
  })
  .refine((data) => Boolean(data.email?.trim() || data.phone?.trim()), {
    message: "Email or phone is required",
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
      return errorResponse("Valid email or phone is required", "VALIDATION_ERROR", 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (parsed.data.email?.trim()) {
      await sendShadowAccountClaimInvite({
        supabaseAdmin,
        email: parsed.data.email,
      });
    } else if (parsed.data.phone?.trim()) {
      const phoneNorm = normalizePhoneToE164(parsed.data.phone.trim());
      if (phoneNorm) {
        await sendShadowAccountClaimInviteByPhone({
          supabaseAdmin,
          phone: phoneNorm,
        });
      }
    }

    return successResponse({
      message:
        "If we find bookings under this contact, we will send instructions to claim your account.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to process claim request");
  }
}
