import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperadmin, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchGodsEyeCustomerMarkers } from "@/lib/admin/gods-eye-customer-markers";

type PingRow = { provider_id: string };
type BookingRow = { id: string; provider_id: string; location_type?: string; location_id?: string; address_latitude?: number | null; address_longitude?: number | null; status?: string; current_stage?: string };
type ProviderRow = { id: string; business_name?: string; owner_name?: string };
type EventRow = { provider_id: string; lat: number; lng: number; recorded_at: string; booking_id: string | null };
type TrackingRow = { booking_id: string; provider_last_lat?: number | null; provider_last_lng?: number | null; provider_last_at?: string; arrived_at_target?: boolean; arrived_at?: string | null; arrived_distance_m?: number | null; last_distance_to_target_m?: number | null; status?: string };
type LocRow = { id: string; latitude?: number | null; longitude?: number | null; name?: string };
type AtHomeBookingOut = { booking_id: string; provider_id: string; customer_target_lat: number | null; customer_target_lng: number | null; status?: string; current_stage?: string; arrived_at_target: boolean; arrived_at: string | null; arrived_distance_m: number | null; last_distance_to_target_m: number | null; provider_last_lat: number | null; provider_last_lng: number | null; provider_last_at: string | null };

/**
 * GET /api/admin/gods-eye/map-state
 * Superadmin only. Returns provider markers, active at-home bookings (target + tracking), at-salon bookings.
 * `customer_markers` (saved address or last booking coords) when `customer_markers_max` is positive — superadmin-only route.
 * Query: location_type?, booking_status?, provider_status?, time_window_mins?, customer_markers_max? (default 2000, max 5000)
 */
export async function GET(request: NextRequest) {
  try {
    await requireSuperadmin(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const customerMarkersMax = Math.min(
      5000,
      Math.max(0, Number.parseInt(searchParams.get("customer_markers_max") ?? "2000", 10) || 2000)
    );
    const locationType = searchParams.get("location_type"); // at_home | at_salon
    const bookingStatus = searchParams.get("booking_status"); // confirmed | in_progress
    const providerStatus = searchParams.get("provider_status"); // active | suspended
    const timeWindowMins = searchParams.get("time_window_mins"); // e.g. 30
    const country = searchParams.get("country")?.trim();
    const city = searchParams.get("city")?.trim();

    const activeStatuses = ["confirmed", "in_progress"];
    const statusFilter = bookingStatus ? [bookingStatus] : activeStatuses;

    let bookingQuery = admin
      .from("bookings")
      .select(
        "id, provider_id, customer_id, location_type, status, address_latitude, address_longitude, location_id, scheduled_at, current_stage"
      )
      .eq("tenant_id", tenantId)
      .in("status", statusFilter);

    if (locationType) {
      bookingQuery = bookingQuery.eq("location_type", locationType);
    }

    const { data: bookings, error: bookErr } = await bookingQuery;
    if (bookErr) console.warn("gods-eye map-state: bookings query:", bookErr.message);
    const bookingList = bookings || [];

    const cutoff = timeWindowMins
      ? new Date(Date.now() - Number(timeWindowMins) * 60 * 1000).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentProviderIds, error: pingsErr } = await admin
      .from("provider_location_events")
      .select("provider_id")
      .gte("recorded_at", cutoff);
    if (pingsErr) console.warn("gods-eye map-state: provider_location_events query:", pingsErr.message);
    const fromPings = [...new Set((recentProviderIds || []).map((r: PingRow) => r.provider_id))];
    const fromBookings = [...new Set(bookingList.map((b: BookingRow) => b.provider_id))];

    const { data: allActiveProviders } = await admin
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    const fromActive = (allActiveProviders || []).map((p: { id: string }) => p.id);

    const allProviderIds = [...new Set([...fromBookings, ...fromPings, ...fromActive])];

    let customer_markers: Awaited<ReturnType<typeof fetchGodsEyeCustomerMarkers>> = [];
    if (customerMarkersMax > 0) {
      try {
        customer_markers = await fetchGodsEyeCustomerMarkers(admin, tenantId, customerMarkersMax);
      } catch (e) {
        console.error("gods-eye customer markers:", e);
        customer_markers = [];
      }
    }

    if (allProviderIds.length === 0) {
      return successResponse({
        providers: [],
        at_home_bookings: [],
        at_salon_bookings: [],
        customer_markers,
        summary: {
          active_providers: 0,
          active_at_home: 0,
          at_salon: 0,
          en_route: 0,
          arrived: 0,
          customers_mapped: customer_markers.length,
        },
      });
    }

    let providerQuery = admin
      .from("providers")
      .select("id, business_name, owner_name, status")
      .eq("tenant_id", tenantId)
      .in("id", allProviderIds);
    if (providerStatus) {
      providerQuery = providerQuery.eq("status", providerStatus);
    }
    const { data: providers, error: provErr } = await providerQuery;
    if (provErr) console.warn("gods-eye map-state: providers query:", provErr.message);
    const providerList = providers || [];
    const providerIdsFilter = providerList.map((p: ProviderRow) => p.id);

    const { data: latestEvents } = await admin
      .from("provider_location_events")
      .select("provider_id, lat, lng, recorded_at, booking_id")
      .in("provider_id", providerIdsFilter)
      .gte("recorded_at", cutoff)
      .order("recorded_at", { ascending: false });

    const latestByProvider: Record<
      string,
      { lat: number; lng: number; recorded_at: string; booking_id: string | null }
    > = {};
    (latestEvents || []).forEach((e: EventRow) => {
      if (!latestByProvider[e.provider_id]) {
        latestByProvider[e.provider_id] = {
          lat: e.lat,
          lng: e.lng,
          recorded_at: e.recorded_at,
          booking_id: e.booking_id,
        };
      }
    });

    const { data: trackingStates, error: trackingErr } = bookingList.length > 0 ? await admin
      .from("booking_tracking_state")
      .select("booking_id, provider_last_lat, provider_last_lng, provider_last_at, customer_target_lat, customer_target_lng, arrived_at_target, arrived_at, arrived_distance_m, last_distance_to_target_m, status")
      .in(
        "booking_id",
        bookingList.map((b: BookingRow) => b.id)
      ) : { data: [], error: null };
    if (trackingErr) console.warn("gods-eye map-state: booking_tracking_state query:", trackingErr.message);

    const trackingByBooking: Record<string, TrackingRow> = {};
    (trackingStates || []).forEach((t: TrackingRow) => {
      trackingByBooking[t.booking_id] = t;
    });

    const locationIds = bookingList
      .filter((b: BookingRow) => b.location_type === "at_salon" && b.location_id)
      .map((b: BookingRow) => b.location_id);
    const salonLocations: Record<string, { lat: number; lng: number; name?: string }> = {};
    if (locationIds.length > 0) {
      const { data: locs } = await admin
        .from("provider_locations")
        .select("id, latitude, longitude, name")
        .in("id", locationIds);
      (locs || []).forEach((l: LocRow) => {
        if (l.latitude != null && l.longitude != null) {
          salonLocations[l.id] = {
            lat: Number(l.latitude),
            lng: Number(l.longitude),
            name: l.name,
          };
        }
      });
    }

    // Fetch registered locations as fallback for providers without live pings
    const { data: registeredLocations } = await admin
      .from("provider_locations")
      .select("id, provider_id, latitude, longitude, name")
      .in("provider_id", providerIdsFilter)
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    const registeredByProvider: Record<string, { lat: number; lng: number; name?: string }> = {};
    (registeredLocations || []).forEach((loc: { provider_id: string; latitude?: number | null; longitude?: number | null; name?: string }) => {
      if (!registeredByProvider[loc.provider_id] && loc.latitude != null && loc.longitude != null) {
        registeredByProvider[loc.provider_id] = { lat: Number(loc.latitude), lng: Number(loc.longitude), name: loc.name };
      }
    });

    type LastLocation = { provider_last_lat?: number; provider_last_lng?: number; provider_last_at?: string; lat?: number; lng?: number; recorded_at?: string };
    const providerMarkers = providerList.map((p: ProviderRow) => {
      const last = latestByProvider[p.id] || trackingByBooking[bookingList.find((b: BookingRow) => b.provider_id === p.id)?.id ?? ""] as LastLocation | undefined;
      const L = last as LastLocation | undefined;
      let lastLat = L?.provider_last_lat ?? L?.lat;
      let lastLng = L?.provider_last_lng ?? L?.lng;
      const lastAt = L?.provider_last_at ?? L?.recorded_at;

      // Fallback to registered salon location
      if (lastLat == null || lastLng == null) {
        const reg = registeredByProvider[p.id];
        if (reg) {
          lastLat = reg.lat;
          lastLng = reg.lng;
        }
      }

      const activeBooking = bookingList.find((b: BookingRow) => b.provider_id === p.id);
      const ts = activeBooking ? trackingByBooking[activeBooking.id] : null;
      let status: "idle" | "en_route" | "in_service" = "idle";
      if (ts?.status === "en_route") status = "en_route";
      else if (ts?.status === "arrived" || ts?.status === "in_service") status = "in_service";
      return {
        provider_id: p.id,
        name: p.business_name || p.owner_name || "Provider",
        last_lat: lastLat != null ? Number(lastLat) : null,
        last_lng: lastLng != null ? Number(lastLng) : null,
        last_at: lastAt || null,
        status,
        active_booking_id: activeBooking?.id || null,
      };
    });

    const providerIdSet = new Set(providerList.map((p: ProviderRow) => p.id));
    const atHomeBookings = bookingList
      .filter((b: BookingRow) => b.location_type === "at_home" && providerIdSet.has(b.provider_id))
      .map((b: BookingRow) => {
        const ts = trackingByBooking[b.id];
        const targetLat = b.address_latitude != null ? Number(b.address_latitude) : null;
        const targetLng = b.address_longitude != null ? Number(b.address_longitude) : null;
        return {
          booking_id: b.id,
          provider_id: b.provider_id,
          customer_target_lat: targetLat,
          customer_target_lng: targetLng,
          status: b.status,
          current_stage: b.current_stage,
          arrived_at_target: ts?.arrived_at_target ?? false,
          arrived_at: ts?.arrived_at ?? null,
          arrived_distance_m: ts?.arrived_distance_m ?? null,
          last_distance_to_target_m: ts?.last_distance_to_target_m ?? null,
          provider_last_lat: ts?.provider_last_lat ?? null,
          provider_last_lng: ts?.provider_last_lng ?? null,
          provider_last_at: ts?.provider_last_at ?? null,
        };
      })
      .filter((b: AtHomeBookingOut) => b.customer_target_lat != null && b.customer_target_lng != null);

    const atSalonBookings = bookingList
      .filter((b: BookingRow) => b.location_type === "at_salon" && b.location_id && providerIdSet.has(b.provider_id))
      .map((b: BookingRow) => {
        const salon = salonLocations[b.location_id];
        if (!salon) return null;
        return {
          booking_id: b.id,
          provider_id: b.provider_id,
          salon_lat: salon.lat,
          salon_lng: salon.lng,
          salon_name: salon.name,
          status: b.status,
          current_stage: b.current_stage,
        };
      })
      .filter(Boolean);

    const summary = {
      active_providers: providerMarkers.filter((p: { last_lat: number | null }) => p.last_lat != null).length,
      active_at_home: atHomeBookings.length,
      at_salon: atSalonBookings.length,
      en_route: atHomeBookings.filter((b: AtHomeBookingOut) => !b.arrived_at_target).length,
      arrived: atHomeBookings.filter((b: AtHomeBookingOut) => b.arrived_at_target).length,
      customers_mapped: customer_markers.length,
    };

    return successResponse({
      providers: providerMarkers,
      at_home_bookings: atHomeBookings,
      at_salon_bookings: atSalonBookings,
      customer_markers,
      summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load map state");
  }
}
