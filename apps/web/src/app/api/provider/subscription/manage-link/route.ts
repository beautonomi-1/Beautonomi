import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getSubscriptionManageLink } from "@/lib/payments/paystack-complete";
import { getAppleBillingPaystackBlock } from "@/lib/iap/apple/ios-eligibility";

/**
 * GET /api/provider/subscription/manage-link
 * 
 * Get a Paystack subscription management link to allow the provider to update their card.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const appleBilling = await getAppleBillingPaystackBlock(supabase, providerId);
    if (appleBilling.blocked) {
      return errorResponse(appleBilling.message, "APPLE_BILLING_ACTIVE", 409);
    }

    // Get current subscription
    const { data: subscription } = await supabase
      .from("provider_subscriptions")
      .select("id, status, paystack_subscription_code")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!subscription) {
      return notFoundResponse("No subscription found");
    }

    const subCode = (subscription as { paystack_subscription_code?: string | null }).paystack_subscription_code;
    if (!subCode) {
      return errorResponse("This subscription is not managed via Paystack.", "NO_PAYSTACK_SUBSCRIPTION", 400);
    }

    const res = await getSubscriptionManageLink(subCode, { tenantId });

    if (!res.status || !res.data?.link) {
      throw new Error(res.message || "Failed to generate manage link");
    }

    return successResponse({ link: res.data.link });
  } catch (error) {
    return handleApiError(error, "Failed to get subscription management link");
  }
}
