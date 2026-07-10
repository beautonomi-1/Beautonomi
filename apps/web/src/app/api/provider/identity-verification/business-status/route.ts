/**
 * GET /api/provider/identity-verification/business-status
 *
 * Normalized KYB status for the authenticated provider.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getBusinessVerificationStatus } from "@/lib/identity-verification/identity-verification-service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    let providerId: string | null = null;
    const { data: byOwner } = await supabase
      .from("providers")
      .select("id, payee_kind")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (byOwner) {
      providerId = byOwner.id;
    } else {
      const { data: staff } = await supabase
        .from("provider_staff")
        .select("provider_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      providerId = staff?.provider_id ?? null;
    }
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const payeeKind = (byOwner as { payee_kind?: string } | null)?.payee_kind ?? "individual";
    if (payeeKind !== "business") {
      return successResponse({ status: "not_required" as const });
    }

    const status = await getBusinessVerificationStatus(providerId);
    return successResponse({ status });
  } catch (error) {
    return handleApiError(error);
  }
}
