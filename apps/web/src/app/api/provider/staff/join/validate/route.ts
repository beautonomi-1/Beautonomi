import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import {
  isStaffInviteTokenValid,
  loadStaffInviteRowByToken,
} from "@/lib/provider/staff-invite";
import { loadStaffInvitationByToken } from "@/lib/provider/staff-invitations";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/provider/staff/join/validate?token=
 * Public preview for join page (business name, staff name, expiry).
 *
 * Intentionally public: the join page is rendered before authentication so an
 * invited staff member can see who invited them. Authorisation is enforced by
 * the opaque UUID invite token (validated + expiry-checked below), not a
 * session. The path must remain under /api/provider/** because shipped mobile
 * builds (>=1.0.76) already call this exact URL; relocating it to /api/public/**
 * would break backwards compatibility for released apps.
 */
// eslint-disable-next-line perf/require-auth-on-route -- token-gated public preview; see doc comment above
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    if (!token || !UUID_RE.test(token)) {
      return errorResponse("A valid invite token is required", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const [row, invitation] = await Promise.all([
      loadStaffInviteRowByToken(admin, token),
      loadStaffInvitationByToken(admin, token),
    ]);
    if (!row) {
      // Revoked invites have their 810 token cleared; surface that explicitly.
      if (invitation?.status === "revoked") {
        return errorResponse("This invite was revoked. Ask your manager to send a new one.", "INVITE_REVOKED", 410);
      }
      return notFoundResponse("Invite not found or no longer valid");
    }

    const revoked = invitation?.status === "revoked";
    const deactivated = !row.is_active;
    const valid = !revoked && isStaffInviteTokenValid(row);
    const alreadyAccepted = Boolean(row.invite_accepted_at);

    return successResponse({
      valid: (valid || alreadyAccepted) && !revoked && !deactivated,
      already_accepted: alreadyAccepted,
      expired: !valid && !alreadyAccepted && !revoked && !deactivated,
      revoked,
      deactivated,
      business_name: row.business_name,
      staff_name: row.name,
      email_hint: row.email ? maskEmail(row.email) : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to validate invite");
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
