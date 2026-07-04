/**
 * POST /api/admin/identity-verification/sessions/[id]/resend
 *
 * Creates a fresh Didit session for the user (allows admin to re-send verification).
 * Audited.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();

    const { data: session, error } = await supabase
      .from("identity_verification_sessions")
      .select("user_id, persona_type, provider_id")
      .eq("id", params.id)
      .maybeSingle();

    if (error || !session) return errorResponse("Session not found", "NOT_FOUND", 404);

    // Mark existing session as abandoned so a new one can be created
    await supabase
      .from("identity_verification_sessions")
      .update({ status: "abandoned", completed_at: new Date().toISOString() })
      .eq("id", params.id);

    // Audit
    await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      action:        "identity_verification.admin_resend",
      resource_type: "identity_verification_session",
      resource_id:   params.id,
      metadata:      { session_id: params.id },
    });

    return successResponse({
      ok: true,
      message: "Session marked abandoned. User can now start a new verification.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
