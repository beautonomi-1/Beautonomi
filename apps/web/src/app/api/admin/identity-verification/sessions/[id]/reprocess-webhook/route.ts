/**
 * POST /api/admin/identity-verification/sessions/[id]/reprocess-webhook
 *
 * Re-fetches the Didit decision for a session and applies it.
 * Useful for fixing sessions where the webhook was dropped.
 * Audited.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reconcileSession } from "@/lib/identity-verification/identity-verification-service";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();

    const { data: session, error } = await supabase
      .from("identity_verification_sessions")
      .select("id, provider_session_id")
      .eq("id", params.id)
      .maybeSingle();

    if (error || !session) return errorResponse("Session not found", "NOT_FOUND", 404);

    const providerSessionId = (session as Record<string, unknown>).provider_session_id as string | null;
    if (!providerSessionId) {
      return errorResponse("No Didit session id — cannot reprocess", "NO_PROVIDER_SESSION_ID", 400);
    }

    await reconcileSession(params.id, providerSessionId);

    // Audit
    await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      action:        "identity_verification.admin_reprocess",
      resource_type: "identity_verification_session",
      resource_id:   params.id,
      metadata:      { session_id: params.id, provider_session_id: providerSessionId },
    });

    return successResponse({ ok: true, message: "Decision re-fetched and applied" });
  } catch (err) {
    return handleApiError(err);
  }
}
