/**
 * GET /api/provider/identity-verification/status
 *
 * Returns the current normalized verification status for the authenticated provider.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getVerificationStatus } from "@/lib/identity-verification/identity-verification-service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);

    const supabase = getSupabaseAdmin();
    const { data: providerRow } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const providerId = (providerRow as { id?: string } | null)?.id ?? null;

    const status = await getVerificationStatus(user.id, "provider", providerId);
    return successResponse({ status });
  } catch (err) {
    return handleApiError(err);
  }
}
