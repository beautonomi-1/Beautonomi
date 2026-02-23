/**
 * GET /api/provider/verification/status
 * Returns current provider's Sumsub verification status. Provider only.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    let providerId: string | null = null;
    const { data: byOwner } = await supabase.from("providers").select("id").eq("user_id", user.id).limit(1).maybeSingle();
    if (byOwner) providerId = byOwner.id;
    else {
      const { data: staff } = await supabase.from("provider_staff").select("provider_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (staff?.provider_id) providerId = staff.provider_id;
    }
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const { data, error } = await supabase
      .from("provider_verification_status")
      .select("status, sumsub_applicant_id, last_reviewed_at, updated_at")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;
    return successResponse(data ?? { status: "pending", sumsub_applicant_id: null, last_reviewed_at: null, updated_at: null });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get verification status");
  }
}
