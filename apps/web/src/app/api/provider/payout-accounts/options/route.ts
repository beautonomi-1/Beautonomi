import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  getEffectiveSkipPayoutAccountVerification,
  showVerifyAccountButton,
} from "@/lib/payments/payout-account-verification-settings";
import { loadProviderPayoutRailContext } from "@/lib/payments/payout-rail";

/**
 * GET /api/provider/payout-accounts/options
 *
 * UI flags for provider payout setup (web + mobile): Paystack bank vs Stripe Connect.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }
    const { data: prow } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const { skip } = await getEffectiveSkipPayoutAccountVerification(admin, effectiveTenantId);
    const railContext = await loadProviderPayoutRailContext(admin, providerId, effectiveTenantId);

    return successResponse({
      show_verify_account_button: showVerifyAccountButton(skip),
      skip_payout_account_verification: skip,
      payout_rail: railContext?.payout_rail ?? "paystack",
      stripe_connect: railContext?.stripe_connect ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load payout account options");
  }
}
