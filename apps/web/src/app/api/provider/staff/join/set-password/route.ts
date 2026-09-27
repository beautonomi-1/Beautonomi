import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  handleApiError,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { loadStaffInviteRowByToken, isStaffInviteTokenValid } from "@/lib/provider/staff-invite";

const bodySchema = z.object({
  token: z.string().min(8),
  password: z.string().min(8).max(128),
});

/**
 * POST /api/provider/staff/join/set-password
 * Set initial password using a valid staff invite token (no short-lived recovery link).
 *
 * Intentionally unauthenticated: password is set using the same opaque invite token
 * validated on the join flow (see /api/provider/staff/join/validate).
 */
// eslint-disable-next-line perf/require-auth-on-route -- invite token gates access; see doc comment above
export async function POST(request: NextRequest) {
  try {
    const body = bodySchema.parse(await request.json());
    const admin = getSupabaseAdmin();
    const row = await loadStaffInviteRowByToken(admin, body.token.trim());
    if (!row) {
      return errorResponse("Invite not found", "NOT_FOUND", 404);
    }
    if (row.invite_accepted_at) {
      return errorResponse("Invite already accepted", "INVALID_STATE", 400);
    }
    if (!isStaffInviteTokenValid(row)) {
      return errorResponse("Invite expired", "INVITE_EXPIRED", 400);
    }
    if (!row.user_id) {
      return errorResponse("Staff account not ready", "INVALID_STATE", 400);
    }

    const { error } = await admin.auth.admin.updateUserById(row.user_id, {
      password: body.password,
    });
    if (error) throw error;

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to set password");
  }
}
