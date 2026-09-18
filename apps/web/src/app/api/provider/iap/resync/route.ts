import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { resyncProviderSubscriptionFromAppleLog } from "@/lib/iap/apple/resync-subscription-from-log";

/**
 * POST /api/provider/iap/resync
 *
 * Re-applies the best active subscription transaction from apple_iap_transactions
 * when StoreKit restore returned no purchases on the device.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const result = await resyncProviderSubscriptionFromAppleLog(supabase, providerId);
    if (!result.ok) {
      return errorResponse(
        result.error ?? "Unable to resync Apple subscription",
        "IAP_RESYNC_FAILED",
        422,
      );
    }

    const { data: subscription } = await supabase
      .from("provider_subscriptions")
      .select(
        "*, plan:subscription_plans!plan_id(id, name, description, price_monthly, price_yearly, currency, features, is_free)",
      )
      .eq("provider_id", providerId)
      .maybeSingle();

    return successResponse({
      applied: result.applied,
      product_id: result.productId,
      subscription,
    });
  } catch (error) {
    return handleApiError(error, "Failed to resync Apple subscription");
  }
}
