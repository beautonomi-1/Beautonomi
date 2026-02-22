/**
 * Feature Gating Utilities
 * 
 * Provides utilities to check if a provider has access to specific features
 * based on their subscription tier.
 */

import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Check if a provider has access to a specific feature
 */
export async function providerHasFeatureAccess(
  providerId: string,
  featureKey: string
): Promise<boolean> {
  try {
    const supabase = await getSupabaseServer();
    
    const { data, error } = await supabase.rpc("provider_has_feature_access", {
      provider_id_param: providerId,
      feature_key_param: featureKey,
    });

    if (error) {
      console.error("Error checking feature access:", error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error("Error in providerHasFeatureAccess:", error);
    return false;
  }
}

/**
 * Get provider's subscription tier details
 */
export async function getProviderSubscriptionTier(providerId: string) {
  try {
    const supabase = await getSupabaseServer();
    
    const { data, error } = await supabase.rpc("get_provider_subscription_tier", {
      provider_id_param: providerId,
    });

    if (error) {
      console.error("Error getting subscription tier:", error);
      return null;
    }

    return data?.[0] || null;
  } catch (error) {
    console.error("Error in getProviderSubscriptionTier:", error);
    return null;
  }
}

/**
 * Check if provider can perform an action based on limits
 */
export async function checkProviderLimit(
  providerId: string,
  limitType: "bookings" | "staff" | "locations"
): Promise<{ allowed: boolean; current: number; limit: number | null }> {
  try {
    const supabase = await getSupabaseServer();
    
    const tier = await getProviderSubscriptionTier(providerId);
    if (!tier) {
      return { allowed: false, current: 0, limit: null };
    }

    let current = 0;
    let limit: number | null = null;

    if (limitType === "bookings") {
      limit = tier.max_bookings_per_month;
      // Count bookings this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .gte("created_at", startOfMonth.toISOString());
      
      current = count || 0;
    } else if (limitType === "staff") {
      limit = tier.max_staff_members;
      const { count } = await supabase
        .from("provider_staff")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("status", "active");
      
      current = count || 0;
    } else if (limitType === "locations") {
      limit = tier.max_locations;
      const { count } = await supabase
        .from("provider_locations")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .eq("is_active", true);
      
      current = count || 0;
    }

    const allowed = limit === null || current < limit;

    return { allowed, current, limit };
  } catch (error) {
    console.error("Error in checkProviderLimit:", error);
    return { allowed: false, current: 0, limit: null };
  }
}

/**
 * Get all features available to a provider
 */
export async function getProviderFeatures(providerId: string): Promise<string[]> {
  try {
    const tier = await getProviderSubscriptionTier(providerId);
    if (!tier) {
      return [];
    }

    return Array.isArray(tier.features) ? tier.features : [];
  } catch (error) {
    console.error("Error in getProviderFeatures:", error);
    return [];
  }
}
