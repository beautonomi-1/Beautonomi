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
  platform?: string;
  portal?: string;
  /** Resolved from Host → tenant_domains on identify request (§14.7). */
  active_tenant_id?: string;
  active_tenant_slug?: string;
  /** User preferred home market from `users.preferred_home_tenant_id`. */
  preferred_home_tenant_id?: string | null;
  preferred_language?: string | null;
  signup_source?: string | null;
  has_email?: boolean;
  has_phone?: boolean;
  has_name?: boolean;
  analytics_consent?: boolean;
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

/** Allowed Amplitude user property keys (no PII). Used for schema contract tests. */
export const AMPLITUDE_USER_PROPERTY_KEYS = [
  "user_id", "role", "portal", "platform", "device_type",
  "active_tenant_id", "active_tenant_slug", "preferred_home_tenant_id",
  "preferred_language", "signup_source",
  "country", "city", "has_email", "has_phone", "has_name", "analytics_consent",
  "lifetime_bookings", "last_booking_date", "loyalty_points", "membership_plan_id", "plan_tier", "favorite_categories",
  "provider_id", "location_id", "provider_status", "business_type", "is_verified", "subscription_tier",
  "locations_count", "staff_count", "yoco_enabled", "paystack_subaccount_status", "total_bookings", "total_revenue",
] as const;

/** Keys that must never appear in identify output (PII). */
export const FORBIDDEN_PII_KEYS = ["email", "phone", "full_name", "phone_number"] as const;

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
  userData?: {
    email?: string;
    full_name?: string;
    phone?: string;
  },
  /** Active market from request Host (when resolvable); non-PII UUIDs/slug only. */
  activeTenant?: { id: string; slug: string } | null
): Promise<UserProperties> {
  const supabase = await getSupabaseServer();
  const properties: UserProperties = {
    user_id: userId,
    role,
    device_type: detectDeviceType(),
  };

  if (activeTenant) {
    properties.active_tenant_id = activeTenant.id;
    properties.active_tenant_slug = activeTenant.slug;
  }

  try {
    // Non-PII profile flags only (never send raw email, phone, full_name)
    if (userData) {
      properties.has_email = !!(userData.email && String(userData.email).trim());
      properties.has_phone = !!(userData.phone && String(userData.phone).trim());
      properties.has_name = !!(userData.full_name && String(userData.full_name).trim());
    }

    // Fetch preferred_language and signup_source from users
    const { data: userRow } = await supabase
      .from("users")
      .select("preferred_language, signup_source, preferred_home_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (userRow) {
      if (userRow.preferred_language != null) properties.preferred_language = userRow.preferred_language;
      if (userRow.signup_source != null) properties.signup_source = userRow.signup_source;
      if (userRow.preferred_home_tenant_id != null) {
        properties.preferred_home_tenant_id = userRow.preferred_home_tenant_id;
      }
    }

    // Fetch user_profiles for analytics_consent and (for customers) beauty_preferences
    const { data: profileRow } = await supabase
      .from("user_profiles")
      .select("privacy_settings, beauty_preferences")
      .eq("user_id", userId)
      .maybeSingle();
    const privacySettings = (profileRow?.privacy_settings as { analytics_consent?: boolean } | null) ?? {};
    properties.analytics_consent = privacySettings.analytics_consent !== false;

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
          properties.plan_tier = provider.subscription_tier ?? "free";

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
      properties.plan_tier = membership?.membership_plan_id ? "member" : "none";

      // favorite_categories: derive from beauty_preferences (non-empty keys as category hints)
      const beautyPrefs = (profileRow?.beauty_preferences as Record<string, unknown> | null) ?? {};
      const categoryKeys = ["hair_type", "skin_type", "appointment_style", "product_preferences"];
      properties.favorite_categories = categoryKeys.filter(
        (k) => beautyPrefs[k] != null && String(beautyPrefs[k]).trim() !== ""
      );
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
