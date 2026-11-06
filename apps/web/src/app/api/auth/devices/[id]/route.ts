import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readSessionIdFromRequest } from "@/lib/auth/trust-device";

/** Forget a trusted device and end the sessions that were verified on it. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("user_trusted_devices")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) {
      return errorResponse("Device not found", "NOT_FOUND", 404);
    }
    await admin
      .from("user_trusted_devices")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "user_revoked" })
      .eq("id", id);

    const currentSessionId = await readSessionIdFromRequest(request);
    const { data: verifications } = await admin
      .from("auth_session_verifications")
      .select("session_id")
      .eq("user_id", user.id)
      .eq("device_id", id);
    const sessionIds = (verifications ?? [])
      .map((v) => (v as { session_id: string }).session_id)
      .filter((sid) => sid && sid !== currentSessionId);
    if (sessionIds.length > 0) {
      const { error } = await admin.rpc("revoke_user_sessions_by_ids", {
        uid: user.id,
        session_ids: sessionIds,
      });
      if (error) console.warn("[devices] session revoke failed", error.message);
    }

    return successResponse({ ok: true, sessions_ended: sessionIds.length });
  } catch (error) {
    return handleApiError(error);
  }
}
