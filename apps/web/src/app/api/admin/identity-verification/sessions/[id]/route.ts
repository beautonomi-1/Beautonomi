/**
 * GET /api/admin/identity-verification/sessions/[id]
 *
 * Session detail with full event timeline.
 * Superadmin only.
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();

    const { data: session, error } = await supabase
      .from("identity_verification_sessions")
      .select(`
        *,
        events:identity_verification_events(*)
      `)
      .eq("id", params.id)
      .maybeSingle();

    if (error) throw error;
    if (!session) return errorResponse("Session not found", "NOT_FOUND", 404);

    return successResponse(session);
  } catch (err) {
    return handleApiError(err);
  }
}
