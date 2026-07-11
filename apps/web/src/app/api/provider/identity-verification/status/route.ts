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
import { resolveEffectiveVerificationDisplayStatus } from "@/lib/identity-verification/resolve-effective-verification-display-status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadProviderVerificationState } from "@/lib/verification/provider-verification-state";
import { planRequiresBusinessVerification } from "@/lib/verification/verification-plan";

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

    const status = await resolveEffectiveVerificationDisplayStatus(
      user.id,
      "provider",
      providerId,
    );

    const verificationState = providerId
      ? await loadProviderVerificationState(providerId)
      : null;

    return successResponse({
      status,
      business_verification_required: verificationState
        ? planRequiresBusinessVerification(verificationState.plan)
        : false,
      verification_plan_complete: verificationState?.isComplete ?? false,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
