/**
 * POST /api/admin/identity-verification/sessions/[id]/resolve-flag
 *
 * Resolve/dismiss accuracy flags (name_mismatch, identity_dedupe, under_age, payout_name)
 * with a recorded rationale. Permission-gated + audited.
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
    const body = await request.json() as { flag: string; rationale?: string };
    const { flag, rationale } = body;

    const validFlags = ["name_mismatch", "identity_dedupe", "under_age", "all"];
    if (!validFlags.includes(flag)) {
      return errorResponse(`Invalid flag. Use: ${validFlags.join(", ")}`, "INVALID_FLAG", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: session, error } = await supabase
      .from("identity_verification_sessions")
      .select("user_id")
      .eq("id", params.id)
      .maybeSingle();

    if (error || !session) return errorResponse("Session not found", "NOT_FOUND", 404);

    // Resolve flags on session
    const sessionUpdate: Record<string, unknown> = {};
    const userUpdate: Record<string, unknown> = {};

    if (flag === "name_mismatch" || flag === "all") {
      sessionUpdate.name_mismatch_flag = false;
      userUpdate.name_mismatch_flag    = false;
      userUpdate.name_mismatch_resolved= true;
    }
    if (flag === "identity_dedupe" || flag === "all") {
      sessionUpdate.identity_dedupe_flag = false;
      userUpdate.identity_dedupe_flag    = false;
      userUpdate.identity_dedupe_resolved= true;
    }
    if (flag === "under_age" || flag === "all") {
      sessionUpdate.under_age_flag = false;
      userUpdate.under_age_flag = false;
    }

    await supabase.from("identity_verification_sessions").update(sessionUpdate).eq("id", params.id);
    const userId = (session as Record<string, unknown>).user_id as string;
    if (Object.keys(userUpdate).length > 0) {
      await supabase.from("users").update(userUpdate).eq("id", userId);
    }

    // Audit
    await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      action:        "identity_verification.resolve_flag",
      resource_type: "identity_verification_session",
      resource_id:   params.id,
      metadata:      { flag, rationale, session_id: params.id },
    });

    return successResponse({ ok: true, flag, resolved: true });
  } catch (err) {
    return handleApiError(err);
  }
}
