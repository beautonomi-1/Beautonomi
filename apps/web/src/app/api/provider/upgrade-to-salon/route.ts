import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/upgrade-to-salon
 * Upgrade a freelancer provider to salon status
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider account required",
        403
      );
    }

    // Check current business type and subscription
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("business_type, subscription_plan_id, capabilities")
      .eq("id", providerId)
      .single();

    if (providerError) {
      throw providerError;
    }

    if (!provider) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider account not found",
        404
      );
    }

    // Validate current business type
    if (provider.business_type !== "freelancer") {
      return handleApiError(
        new Error("Already a salon"),
        provider.business_type === "salon"
          ? "Provider is already a salon"
          : "Invalid business type for upgrade",
        400
      );
    }

    // Check if already upgraded (via capabilities)
    if (
      provider.capabilities &&
      typeof provider.capabilities === "object" &&
      (provider.capabilities as any).upgraded_from === "freelancer"
    ) {
      return handleApiError(
        new Error("Already upgraded"),
        "This provider has already been upgraded",
        400
      );
    }

    // Optional: Check subscription allows upgrade
    if (provider.subscription_plan_id) {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("features")
        .eq("id", provider.subscription_plan_id)
        .single();

      if (plan?.features) {
        const features = plan.features as any;
        // If subscription explicitly disallows upgrade, block it
        if (features.allows_salon_upgrade === false) {
          return handleApiError(
            new Error("Subscription doesn't allow upgrade"),
            "Please upgrade your subscription plan to enable salon features",
            403
          );
        }
      }
    }

    // Execute upgrade function
    const { data: upgradeResult, error: upgradeError } = await supabase.rpc(
      "upgrade_freelancer_to_salon",
      { p_provider_id: providerId }
    );

    if (upgradeError) {
      console.error("Upgrade error:", upgradeError);
      throw upgradeError;
    }

    // Get updated provider data
    const { data: updatedProvider } = await supabase
      .from("providers")
      .select("id, business_type, capabilities")
      .eq("id", providerId)
      .single();

    return successResponse({
      upgraded: true,
      message: "Successfully upgraded to salon",
      provider: updatedProvider,
      details: upgradeResult,
    });
  } catch (error: any) {
    console.error("Error upgrading to salon:", error);
    return handleApiError(
      error,
      error.message || "Failed to upgrade to salon"
    );
  }
}
