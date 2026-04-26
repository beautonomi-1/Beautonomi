import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/analytics/geo
 *
 * Geographic analytics: provider and customer distribution by city/postal code,
 * booking volume and value by geography, and device platform breakdown.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const [
      providerLocationsResult,
      customerAddressesResult,
      bookingGeoResult,
      deviceResult,
      bookingValueResult,
    ] = await Promise.all([
      // Provider locations with city/state/postal grouping
      supabase
        .from("provider_locations")
        .select(
          "id, city, state, country, postal_code, latitude, longitude, is_active, provider_id, providers!inner(tenant_id, status)"
        )
        .eq("providers.tenant_id", tenantId)
        .eq("is_active", true),

      // Customer addresses with city/postal grouping
      supabase
        .from("user_addresses")
        .select(
          "id, city, state, postal_code, country, latitude, longitude, user_id, users!inner(preferred_home_tenant_id, role)"
        )
        .eq("users.preferred_home_tenant_id", tenantId),

      // Bookings with geo data (exclude cancelled so city/value views stay aligned)
      supabase
        .from("bookings")
        .select(
          "id, address_city, address_state, address_postal_code, location_type, total_price, status, scheduled_at"
        )
        .eq("tenant_id", tenantId)
        .not("address_city", "is", null)
        .not("status", "eq", "cancelled"),

      // Device platform breakdown
      supabase
        .from("user_devices")
        .select(
          "id, platform, app_type, last_seen, user_id, users!inner(preferred_home_tenant_id)"
        )
        .eq("users.preferred_home_tenant_id", tenantId),

      // Booking value aggregation (all non-cancelled bookings, even without geo)
      supabase
        .from("bookings")
        .select("id, total_price, location_type, status, address_city")
        .eq("tenant_id", tenantId)
        .not("status", "eq", "cancelled"),
    ]);

    // --- Provider Distribution by City ---
    type ProvLocRow = {
      city?: string | null;
      state?: string | null;
      country?: string | null;
      postal_code?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      provider_id?: string;
      providers?: { status?: string } | null;
    };
    const providerRows = (providerLocationsResult.data ?? []) as ProvLocRow[];
    const providersByCity: Record<
      string,
      { count: number; active: number; lat: number; lng: number }
    > = {};
    const providersByPostal: Record<string, { count: number; city: string }> =
      {};
    const uniqueProviderIds = new Set<string>();

    for (const loc of providerRows) {
      const city = (loc.city || "Unknown").trim();
      const postal = (loc.postal_code || "").trim();
      const provStatus = (loc.providers as { status?: string } | null)?.status;
      if (!providersByCity[city]) {
        providersByCity[city] = { count: 0, active: 0, lat: 0, lng: 0 };
      }
      providersByCity[city].count++;
      if (provStatus === "active") providersByCity[city].active++;
      if (loc.latitude && loc.longitude) {
        providersByCity[city].lat = loc.latitude;
        providersByCity[city].lng = loc.longitude;
      }

      if (postal) {
        if (!providersByPostal[postal]) {
          providersByPostal[postal] = { count: 0, city };
        }
        providersByPostal[postal].count++;
      }
      if (loc.provider_id) uniqueProviderIds.add(loc.provider_id);
    }

    // --- Customer Distribution by City ---
    type CustAddrRow = {
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      user_id?: string;
    };
    const customerRows = (customerAddressesResult.data ?? []) as CustAddrRow[];
    const customersByCity: Record<
      string,
      { count: number; lat: number; lng: number }
    > = {};
    const customersByPostal: Record<string, { count: number; city: string }> =
      {};
    const uniqueCustomerIds = new Set<string>();

    for (const addr of customerRows) {
      const city = (addr.city || "Unknown").trim();
      const postal = (addr.postal_code || "").trim();
      if (!customersByCity[city]) {
        customersByCity[city] = { count: 0, lat: 0, lng: 0 };
      }
      if (addr.user_id && !uniqueCustomerIds.has(addr.user_id)) {
        customersByCity[city].count++;
        uniqueCustomerIds.add(addr.user_id);
      }
      if (addr.latitude && addr.longitude) {
        customersByCity[city].lat = addr.latitude;
        customersByCity[city].lng = addr.longitude;
      }
      if (postal) {
        if (!customersByPostal[postal]) {
          customersByPostal[postal] = { count: 0, city };
        }
        if (addr.user_id) customersByPostal[postal].count++;
      }
    }

    // --- Booking Geo Distribution ---
    type BookingGeoRow = {
      address_city?: string | null;
      address_state?: string | null;
      address_postal_code?: string | null;
      location_type?: string | null;
      total_price?: number | null;
      status?: string | null;
    };
    const bookingRows = (bookingGeoResult.data ?? []) as BookingGeoRow[];
    const bookingsByCity: Record<
      string,
      { count: number; value: number; at_home: number; at_salon: number }
    > = {};

    for (const b of bookingRows) {
      const city = (b.address_city || "Unknown").trim();
      if (!bookingsByCity[city]) {
        bookingsByCity[city] = { count: 0, value: 0, at_home: 0, at_salon: 0 };
      }
      bookingsByCity[city].count++;
      bookingsByCity[city].value += Number(b.total_price || 0);
      if (b.location_type === "at_home" || b.location_type === "house_call") {
        bookingsByCity[city].at_home++;
      } else {
        bookingsByCity[city].at_salon++;
      }
    }

    // --- Device Platform Breakdown ---
    type DeviceRow = {
      platform?: string | null;
      app_type?: string | null;
      last_seen?: string | null;
      user_id?: string;
    };
    const deviceRows = (deviceResult.data ?? []) as DeviceRow[];
    const deviceBreakdown: Record<
      string,
      { total: number; customer: number; provider: number }
    > = {
      ios: { total: 0, customer: 0, provider: 0 },
      android: { total: 0, customer: 0, provider: 0 },
      web: { total: 0, customer: 0, provider: 0 },
    };
    let activeDevices30d = 0;
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    for (const d of deviceRows) {
      const platform = (d.platform || "web").toLowerCase();
      const appType = (d.app_type || "customer").toLowerCase();
      if (!deviceBreakdown[platform]) {
        deviceBreakdown[platform] = { total: 0, customer: 0, provider: 0 };
      }
      deviceBreakdown[platform].total++;
      if (appType === "provider") {
        deviceBreakdown[platform].provider++;
      } else {
        deviceBreakdown[platform].customer++;
      }
      if (d.last_seen && d.last_seen >= thirtyDaysAgo) {
        activeDevices30d++;
      }
    }

    // --- Booking Value by Location Type ---
    type BookingValRow = {
      total_price?: number | null;
      location_type?: string | null;
      status?: string | null;
      address_city?: string | null;
    };
    const valueRows = (bookingValueResult.data ?? []) as BookingValRow[];
    let totalBookingValue = 0;
    let atHomeValue = 0;
    let atSalonValue = 0;
    let atHomeCount = 0;
    let atSalonCount = 0;

    for (const v of valueRows) {
      const val = Number(v.total_price || 0);
      totalBookingValue += val;
      if (
        v.location_type === "at_home" ||
        v.location_type === "house_call"
      ) {
        atHomeValue += val;
        atHomeCount++;
      } else {
        atSalonValue += val;
        atSalonCount++;
      }
    }

    // Sort cities by count descending for the top-N lists
    const sortedProviderCities = Object.entries(providersByCity)
      .map(([city, data]) => ({ city, ...data }))
      .sort((a, b) => b.count - a.count);

    const sortedCustomerCities = Object.entries(customersByCity)
      .map(([city, data]) => ({ city, ...data }))
      .sort((a, b) => b.count - a.count);

    const sortedBookingCities = Object.entries(bookingsByCity)
      .map(([city, data]) => ({ city, ...data }))
      .sort((a, b) => b.value - a.value);

    const sortedProviderPostals = Object.entries(providersByPostal)
      .map(([postal, data]) => ({ postal_code: postal, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    const sortedCustomerPostals = Object.entries(customersByPostal)
      .map(([postal, data]) => ({ postal_code: postal, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    return successResponse({
      summary: {
        total_provider_locations: providerRows.length,
        unique_providers: uniqueProviderIds.size,
        total_customer_addresses: customerRows.length,
        unique_customers: uniqueCustomerIds.size,
        provider_cities: sortedProviderCities.length,
        customer_cities: sortedCustomerCities.length,
        total_devices: deviceRows.length,
        active_devices_30d: activeDevices30d,
      },

      providers_by_city: sortedProviderCities,
      providers_by_postal: sortedProviderPostals,

      customers_by_city: sortedCustomerCities,
      customers_by_postal: sortedCustomerPostals,

      bookings_by_city: sortedBookingCities,

      booking_value: {
        total: totalBookingValue,
        at_home: { count: atHomeCount, value: atHomeValue },
        at_salon: { count: atSalonCount, value: atSalonValue },
        avg_booking_value:
          valueRows.length > 0 ? totalBookingValue / valueRows.length : 0,
      },

      device_platforms: Object.entries(deviceBreakdown).map(
        ([platform, data]) => ({
          platform,
          ...data,
        })
      ),
    });
  } catch (error) {
    return handleApiError(
      error as Error,
      "Failed to fetch geo analytics"
    );
  }
}
