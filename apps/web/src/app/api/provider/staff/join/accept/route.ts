import { NextRequest } from "next/server";
import {
  requireAuthInApi,
  successResponse,
  errorResponse,
  handleApiError,
  ACTIVE_PROVIDER_ID_COOKIE,
} from "@/lib/supabase/api-helpers";
import { acceptStaffInvite } from "@/lib/provider/staff-invite";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().uuid(),
});

/**
 * POST /api/provider/staff/join/accept
 * Authenticated user accepts a staff invite and is promoted to provider_staff.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("A valid token is required", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    try {
      const result = await acceptStaffInvite({
        token: parsed.data.token,
        userId: user.id,
        userEmail: user.email,
      });

      const response = successResponse({
        staff_id: result.staff_id,
        provider_id: result.provider_id,
        already_accepted: result.already_accepted,
        role: result.role,
      });
      response.cookies.set(ACTIVE_PROVIDER_ID_COOKIE, result.provider_id, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    } catch (err) {
      const code = err instanceof Error ? err.message : "ACCEPT_FAILED";
      if (code === "INVITE_NOT_FOUND") {
        return errorResponse("Invite not found or no longer valid", "NOT_FOUND", 404);
      }
      if (code === "INVITE_EXPIRED") {
        return errorResponse("This invite has expired. Ask your manager to resend.", "INVITE_EXPIRED", 410);
      }
      if (code === "EMAIL_MISMATCH") {
        return errorResponse(
          "Sign in with the email address that received the invite.",
          "EMAIL_MISMATCH",
          403,
        );
      }
      if (code === "INVITE_ALREADY_ACCEPTED") {
        return errorResponse("This invite was already used by another account.", "INVITE_USED", 409);
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "Failed to accept invite");
  }
}
