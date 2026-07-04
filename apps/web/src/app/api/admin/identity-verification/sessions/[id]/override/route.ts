/**
 * POST /api/admin/identity-verification/sessions/[id]/override
 *
 * Manually override a session status (approve/reject/reset).
 * All actions are permission-gated + audited.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncProviderVerificationStateFromDidit } from "@/lib/verification/sync-provider-verification";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json() as { status: string; reason?: string };
    const { status: newStatus, reason } = body;

    if (!["approved","rejected","reset"].includes(newStatus)) {
      return errorResponse("Invalid status. Use: approved, rejected, reset", "INVALID_STATUS", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: session, error } = await supabase
      .from("identity_verification_sessions")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error || !session) return errorResponse("Session not found", "NOT_FOUND", 404);

    // Update session status
    await supabase
      .from("identity_verification_sessions")
      .update({
        status:           newStatus,
        rejection_reason: reason ?? null,
        completed_at:     ["approved","rejected"].includes(newStatus) ? new Date().toISOString() : null,
        last_event_at:    new Date().toISOString(),
      })
      .eq("id", params.id);

    // Sync to legacy columns
    const persona = (session as Record<string, unknown>).persona_type as string;
    const providerId = (session as Record<string, unknown>).provider_id as string | null;
    const userId = (session as Record<string, unknown>).user_id as string;

    if (persona === "provider" && providerId) {
      await syncProviderVerificationStateFromDidit(providerId, newStatus, reason ?? null, params.id);
    } else {
      // Customer
      await supabase
        .from("users")
        .update({
          identity_verified:             newStatus === "approved",
          identity_verification_status:  newStatus === "approved" ? "approved" : newStatus === "rejected" ? "rejected" : "not_started",
        })
        .eq("id", userId);
    }

    // Audit
    await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      action:        "identity_verification.admin_override",
      resource_type: "identity_verification_session",
      resource_id:   params.id,
      metadata:      { new_status: newStatus, reason, session_id: params.id },
    }).throwOnError();

    return successResponse({ ok: true, new_status: newStatus });
  } catch (err) {
    return handleApiError(err);
  }
}
