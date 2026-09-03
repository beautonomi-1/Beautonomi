import { NextRequest } from "next/server";
import {
  requireAuthInApi,
  successResponse,
  errorResponse,
  handleApiError,
  ACTIVE_PROVIDER_ID_COOKIE,
} from "@/lib/supabase/api-helpers";
import { acceptStaffInvite, loadStaffInviteRowByToken } from "@/lib/provider/staff-invite";
import {
  evaluateStaffInviteAcceptance,
  loadStaffInvitationByToken,
  markStaffInvitationAccepted,
} from "@/lib/provider/staff-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

    // Invite matrix (872): revoked / expired invitations and deactivated staff
    // are rejected with explicit codes before the legacy 810 accept path runs.
    const admin = getSupabaseAdmin();
    const [invitation, legacyRow] = await Promise.all([
      loadStaffInvitationByToken(admin, parsed.data.token),
      loadStaffInviteRowByToken(admin, parsed.data.token),
    ]);
    let staffState: { is_active: boolean | null; deleted_at: string | null; user_id: string | null } | null = null;
    const staffIdForState = invitation?.staff_id ?? legacyRow?.id ?? null;
    if (staffIdForState) {
      const { data: staffRow } = await admin
        .from("provider_staff")
        .select("is_active, deleted_at, user_id")
        .eq("id", staffIdForState)
        .maybeSingle();
      staffState = (staffRow as typeof staffState) ?? null;
    }
    const gate = evaluateStaffInviteAcceptance({
      invitation,
      staff: staffState,
      acceptingUserId: user.id,
    });
    if (gate.ok === false) {
      if (gate.code === "INVITE_REVOKED") {
        return errorResponse("This invite was revoked. Ask your manager to send a new one.", "INVITE_REVOKED", 410);
      }
      if (gate.code === "INVITE_EXPIRED") {
        return errorResponse("This invite has expired. Ask your manager to resend.", "INVITE_EXPIRED", 410);
      }
      if (gate.code === "STAFF_DEACTIVATED") {
        return errorResponse(
          "This team member account has been deactivated. Contact the business owner.",
          "STAFF_DEACTIVATED",
          403,
        );
      }
      return errorResponse("This invite was already used by another account.", "INVITE_USED", 409);
    }

    try {
      const result = await acceptStaffInvite({
        token: parsed.data.token,
        userId: user.id,
        userEmail: user.email,
      });

      if (!result.already_accepted) {
        await markStaffInvitationAccepted(admin, parsed.data.token);
      }

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
