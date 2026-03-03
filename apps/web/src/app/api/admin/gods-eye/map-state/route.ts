import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/gods-eye/map-state
 * Superadmin only. Returns provider markers, active at-home bookings (target + tracking), at-salon bookings.
 * Query: location_type?, booking_status?, provider_status?, country?, city?, time_window_mins?
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
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
      .in("status", statusFilter);

    if (locationType) {
      bookingQuery = bookingQuery.eq("location_type", locationType);
    }

    const { data: bookings, error: bookErr } = await bookingQuery;
    if (bookErr) throw bookErr;
    const bookingList = bookings || [];

    const cutoff = timeWindowMins
      ? new Date(Date.now() - Number(timeWindowMins) * 60 * 1000).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentProviderIds } = await admin
      .from("provider_location_events")
      .select("provider_id")
      .gte("recorded_at", cutoff);
    const fromPings = [...new Set((recentProviderIds || []).map((r: any) => r.provider_id))];
    const fromBookings = [...new Set(bookingList.map((b: any) => b.provider_id))];
    const allProviderIds = [...new Set([...fromBookings, ...fromPings])];

    if (allProviderIds.length === 0) {
      return successResponse({
        providers: [],
        at_home_bookings: [],
        at_salon_bookings: [],
        summary: { active_providers: 0, active_at_home: 0, at_salon: 0, en_route: 0, arrived: 0 },
      });
    }

    let providerQuery = admin.from("providers").select("id, business_name, owner_name, status").in("id", allProviderIds);
    if (providerStatus) {
      providerQuery = providerQuery.eq("status", providerStatus);
    }
    const { data: providers, error: provErr } = await providerQuery;
    if (provErr) throw provErr;
    const providerList = providers || [];
    const providerIdsFilter = providerList.map((p: any) => p.id);

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
    (latestEvents || []).forEach((e: any) => {
      if (!latestByProvider[e.provider_id]) {
        latestByProvider[e.provider_id] = {
          lat: e.lat,
          lng: e.lng,
          recorded_at: e.recorded_at,
          booking_id: e.booking_id,
        };
      }
    });

    const { data: trackingStates } = await admin
      .from("booking_tracking_state")
      .select("booking_id, provider_last_lat, provider_last_lng, provider_last_at, customer_target_lat, customer_target_lng, arrived_at_target, arrived_at, arrived_distance_m, last_distance_to_target_m, status")
      .in(
        "booking_id",
        bookingList.map((b: any) => b.id)
      );

    const trackingByBooking: Record<string, any> = {};
    (trackingStates || []).forEach((t: any) => {
      trackingByBooking[t.booking_id] = t;
    });

    const locationIds = bookingList
      .filter((b: any) => b.location_type === "at_salon" && b.location_id)
      .map((b: any) => b.location_id);
    let salonLocations: Record<string, { lat: number; lng: number; name?: string }> = {};
    if (locationIds.length > 0) {
      const { data: locs } = await admin
        .from("provider_locations")
        .select("id, latitude, longitude, name")
        .in("id", locationIds);
      (locs || []).forEach((l: any) => {
        if (l.latitude != null && l.longitude != null) {
          salonLocations[l.id] = {
            lat: Number(l.latitude),
            lng: Number(l.longitude),
            name: l.name,
          };
        }
      });
    }

    const providerMarkers = providerList.map((p: any) => {
      const last = latestByProvider[p.id] || trackingByBooking[bookingList.find((b: any) => b.provider_id === p.id)?.id];
      const lastLat = last?.provider_last_lat ?? last?.lat;
      const lastLng = last?.provider_last_lng ?? last?.lng;
      const lastAt = last?.provider_last_at ?? last?.recorded_at;
      const activeBooking = bookingList.find((b: any) => b.provider_id === p.id);
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

    const providerIdSet = new Set(providerList.map((p: any) => p.id));
    const atHomeBookings = bookingList
      .filter((b: any) => b.location_type === "at_home" && providerIdSet.has(b.provider_id))
      .map((b: any) => {
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
      .filter((b: any) => b.customer_target_lat != null && b.customer_target_lng != null);

    const atSalonBookings = bookingList
      .filter((b: any) => b.location_type === "at_salon" && b.location_id && providerIdSet.has(b.provider_id))
      .map((b: any) => {
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
      active_providers: providerMarkers.filter((p: any) => p.last_lat != null).length,
      active_at_home: atHomeBookings.length,
      at_salon: atSalonBookings.length,
      en_route: atHomeBookings.filter((b: any) => !b.arrived_at_target).length,
      arrived: atHomeBookings.filter((b: any) => b.arrived_at_target).length,
    };

    return successResponse({
      providers: providerMarkers,
      at_home_bookings: atHomeBookings,
      at_salon_bookings: atSalonBookings,
      summary,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load map state");
  }
}
