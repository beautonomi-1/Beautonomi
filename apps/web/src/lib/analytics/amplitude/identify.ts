/**
 * User Identification Helper
 * Fetches and sets comprehensive user properties for Amplitude
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

export interface UserProperties {
  user_id: string;
  role: string;
  provider_id?: string;
  location_id?: string;
  is_verified?: boolean;
  plan_tier?: string;
  country?: string;
  city?: string;
  device_type?: string;
  // Customer properties
  lifetime_bookings?: number;
  last_booking_date?: string;
  favorite_categories?: string[];
  loyalty_points?: number;
  membership_plan_id?: string;
  // Provider properties
  provider_status?: string;
  business_type?: string;
  locations_count?: number;
  staff_count?: number;
  yoco_enabled?: boolean;
  paystack_subaccount_status?: string;
  subscription_tier?: string;
  total_bookings?: number;
  total_revenue?: number;
}

/**
 * Detect device type from user agent
 */
function detectDeviceType(): string {
  if (typeof window === "undefined") return "unknown";
  
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return "tablet";
  }
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

/**
 * Identify user with comprehensive properties
 */
export async function identifyUser(
  userId: string,
  role: string,
  _userData?: {
    email?: string;
    full_name?: string;
    phone?: string;
  }
): Promise<UserProperties> {
  const supabase = await getSupabaseServer();
  const properties: UserProperties = {
    user_id: userId,
    role,
    device_type: detectDeviceType(),
  };

  try {
    // Fetch provider_id if user is a provider
    if (role === "provider_owner" || role === "provider_staff") {
      const providerId = await getProviderIdForUser(userId);
      if (providerId) {
        properties.provider_id = providerId;

        // Fetch provider details
        const { data: provider } = await supabase
          .from("providers")
          .select("status, business_type, is_verified, subscription_tier")
          .eq("id", providerId)
          .maybeSingle();

        if (provider) {
          properties.provider_status = provider.status;
          properties.business_type = provider.business_type;
          properties.is_verified = provider.is_verified || false;
          properties.subscription_tier = provider.subscription_tier;

          // Count locations
          const { count: locationsCount } = await supabase
            .from("provider_locations")
            .select("*", { count: "exact", head: true })
            .eq("provider_id", providerId);

          properties.locations_count = locationsCount || 0;

          // Count staff
          const { count: staffCount } = await supabase
            .from("provider_staff")
            .select("*", { count: "exact", head: true })
            .eq("provider_id", providerId)
            .eq("is_active", true);

          properties.staff_count = staffCount || 0;

          // Check Yoco integration
          const { data: yocoDevice } = await supabase
            .from("yoco_devices")
            .select("id")
            .eq("provider_id", providerId)
            .eq("is_active", true)
            .maybeSingle();

          properties.yoco_enabled = !!yocoDevice;

          // Check Paystack subaccount
          const { data: paystackSubaccount } = await supabase
            .from("provider_paystack_subaccounts")
            .select("status")
            .eq("provider_id", providerId)
            .maybeSingle();

          properties.paystack_subaccount_status = paystackSubaccount?.status || null;

          // Get provider stats
          const { data: stats } = await supabase
            .from("bookings")
            .select("id, total_amount")
            .eq("provider_id", providerId)
            .eq("status", "completed");

          if (stats) {
            properties.total_bookings = stats.length;
            properties.total_revenue = stats.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
          }
        }

        // If staff, get location_id
        if (role === "provider_staff") {
          const { data: staff } = await supabase
            .from("provider_staff")
            .select("location_id")
            .eq("user_id", userId)
            .eq("is_active", true)
            .maybeSingle();

          if (staff?.location_id) {
            properties.location_id = staff.location_id;
          }
        }
      }
    }

    // Fetch customer properties
    if (role === "customer") {
      // Get booking count
      const { count: bookingCount } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", userId);

      properties.lifetime_bookings = bookingCount || 0;

      // Get last booking date
      const { data: lastBooking } = await supabase
        .from("bookings")
        .select("created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastBooking?.created_at) {
        properties.last_booking_date = lastBooking.created_at;
      }

      // Get loyalty points
      const { data: wallet } = await supabase
        .from("user_wallets")
        .select("loyalty_points")
        .eq("user_id", userId)
        .maybeSingle();

      properties.loyalty_points = wallet?.loyalty_points || 0;

      // Get membership plan
      const { data: membership } = await supabase
        .from("membership_orders")
        .select("membership_plan_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      properties.membership_plan_id = membership?.membership_plan_id || null;
    }

    // Get address for country/city
    const { data: address } = await supabase
      .from("user_addresses")
      .select("country, city")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (address) {
      properties.country = address.country;
      properties.city = address.city;
    } else if (properties.provider_id) {
      // Fallback to provider location
      const { data: providerLocation } = await supabase
        .from("provider_locations")
        .select("country, city")
        .eq("provider_id", properties.provider_id)
        .eq("is_primary", true)
        .maybeSingle();

      if (providerLocation) {
        properties.country = providerLocation.country;
        properties.city = providerLocation.city;
      }
    }
  } catch (error) {
    console.error("[Amplitude] Error fetching user properties:", error);
    // Return basic properties even if fetch fails
  }

  return properties;
}
