import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  getEffectiveSkipPayoutAccountVerification,
  showVerifyAccountButton,
} from "@/lib/payments/payout-account-verification-settings";

/**
 * GET /api/provider/payout-accounts/options
 *
 * UI flags for provider bank-account setup (web + mobile).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const admin = getSupabaseAdmin();
    const { skip } = await getEffectiveSkipPayoutAccountVerification(admin, tenantId);

    return successResponse({
      show_verify_account_button: showVerifyAccountButton(skip),
      skip_payout_account_verification: skip,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load payout account options");
  }
}
