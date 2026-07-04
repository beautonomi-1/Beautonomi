/**
 * GET /api/me/identity-verification/status
 *
 * Returns the current normalized verification status for the authenticated user.
 * Triggers a reconciliation fetch if the session is stale.
 *
 * Response: { status: NormalizedVerificationStatus }
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getVerificationStatus } from "@/lib/identity-verification/identity-verification-service";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const status = await getVerificationStatus(user.id, "customer");
    return successResponse({ status });
  } catch (err) {
    return handleApiError(err);
  }
}
