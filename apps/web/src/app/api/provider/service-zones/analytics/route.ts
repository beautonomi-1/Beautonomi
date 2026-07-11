import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
} from "@/lib/supabase/api-helpers";
import {
  getMapboxService,
  type Coordinates,
  type ServiceZone,
} from "@/lib/mapbox/mapbox";

type ZoneRow = {
  id: string;
  name: string;
  zone_type: string;
  is_active: boolean;
  postal_codes?: string[] | null;
  cities?: string[] | null;
  polygon_coordinates?: unknown;
  center_latitude?: number | string | null;
  center_longitude?: number | string | null;
  radius_km?: number | string | null;
  selection_id: string | null;
};

type BookingRow = {
  id: string;
  service_address?: string | null;
  address_city?: string | null;
  address_postal_code?: string | null;
  address_latitude?: number | string | null;
  address_longitude?: number | string | null;
  total_amount?: string | number | null;
  travel_fee?: string | number | null;
  created_at?: string;
  status?: string;
};

function normalizePolygonCoordinates(
  polygonCoordinates: unknown,
): Coordinates[] | null {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
    return null;
  }

  const ring = Array.isArray(polygonCoordinates[0]) && !("lat" in (polygonCoordinates[0] as object))
    ? (Array.isArray((polygonCoordinates[0] as unknown[])[0])
        ? (polygonCoordinates[0] as unknown[])
        : polygonCoordinates)
    : polygonCoordinates;

  const coords = (ring as unknown[]).map((coord) => {
    if (Array.isArray(coord) && coord.length >= 2) {
      const a = Number(coord[0]);
      const b = Number(coord[1]);
      // Stored as [lat, lng] in provider zones; GeoJSON rings use [lng, lat].
      const looksLikeLngLat = Math.abs(a) <= 180 && Math.abs(b) <= 90 && Math.abs(a) > Math.abs(b);
      return looksLikeLngLat
        ? { longitude: a, latitude: b }
        : { longitude: b, latitude: a };
    }
    if (typeof coord === "object" && coord !== null) {
      const c = coord as {
        longitude?: number;
        latitude?: number;
        lng?: number;
        lat?: number;
      };
      return {
        longitude: Number(c.longitude ?? c.lng ?? 0),
        latitude: Number(c.latitude ?? c.lat ?? 0),
      };
    }
    return { longitude: 0, latitude: 0 };
  });

  return coords.length >= 3 ? coords : null;
}

function toMapboxZone(zone: ZoneRow): ServiceZone | null {
  if (zone.zone_type === "radius") {
    if (zone.center_latitude == null || zone.center_longitude == null) return null;
    return {
      id: zone.id,
      name: zone.name,
      type: "radius",
      coordinates: {
        longitude: Number(zone.center_longitude),
        latitude: Number(zone.center_latitude),
      },
      radius_km: zone.radius_km != null ? Number(zone.radius_km) : undefined,
      is_active: zone.is_active,
    };
  }

  if (zone.zone_type === "polygon") {
    const polygon = normalizePolygonCoordinates(zone.polygon_coordinates);
    if (!polygon) return null;
    return {
      id: zone.id,
      name: zone.name,
      type: "polygon",
      coordinates: polygon,
      is_active: zone.is_active,
    };
  }

  return null;
}

function bookingMatchesZone(
  booking: BookingRow,
  zone: ZoneRow,
  isPointInZone: (point: Coordinates, zoneData: ServiceZone) => boolean,
): boolean {
  if (zone.zone_type === "postal_code" && zone.postal_codes) {
    return Boolean(
      booking.address_postal_code &&
        zone.postal_codes.includes(booking.address_postal_code),
    );
  }

  if (zone.zone_type === "city" && zone.cities) {
    return Boolean(
      booking.address_city &&
        zone.cities.some(
          (city) => city.toLowerCase().trim() === booking.address_city?.toLowerCase().trim(),
        ),
    );
  }

  if (zone.zone_type === "radius" || zone.zone_type === "polygon") {
    if (booking.address_latitude == null || booking.address_longitude == null) {
      return false;
    }
    const point: Coordinates = {
      latitude: Number(booking.address_latitude),
      longitude: Number(booking.address_longitude),
    };
    const zoneData = toMapboxZone(zone);
    if (!zoneData) return false;
    return isPointInZone(point, zoneData);
  }

  return false;
}

/**
 * GET /api/provider/service-zones/analytics
 * Get analytics for service zones
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const { data: zoneSelections, error: selectionsError } = await supabase
      .from("provider_zone_selections")
      .select(`
        id,
        platform_zone_id,
        is_active,
        platform_zone:platform_zones(
          id,
          name,
          zone_type,
          postal_codes,
          cities,
          polygon_coordinates,
          center_latitude,
          center_longitude,
          radius_km
        )
      `)
      .eq("provider_id", providerId);

    if (selectionsError) {
      throw selectionsError;
    }

    const { data: oldZones, error: _oldZonesError } = await supabase
      .from("service_zones")
      .select(
        "id, name, zone_type, is_active, postal_codes, cities, polygon_coordinates, center_latitude, center_longitude, radius_km",
      )
      .eq("provider_id", providerId);

    const zones: ZoneRow[] = (zoneSelections || [])
      .map((selection: any) => ({
        id: selection.platform_zone?.id || selection.id,
        name: selection.platform_zone?.name || "Unknown Zone",
        zone_type: selection.platform_zone?.zone_type || "unknown",
        is_active: selection.is_active,
        postal_codes: selection.platform_zone?.postal_codes,
        cities: selection.platform_zone?.cities,
        polygon_coordinates: selection.platform_zone?.polygon_coordinates,
        center_latitude: selection.platform_zone?.center_latitude,
        center_longitude: selection.platform_zone?.center_longitude,
        radius_km: selection.platform_zone?.radius_km,
        selection_id: selection.id,
      }))
      .concat(
        (oldZones || []).map((zone: any) => ({
          id: zone.id,
          name: zone.name,
          zone_type: zone.zone_type,
          is_active: zone.is_active,
          postal_codes: zone.postal_codes,
          cities: zone.cities,
          polygon_coordinates: zone.polygon_coordinates,
          center_latitude: zone.center_latitude,
          center_longitude: zone.center_longitude,
          radius_km: zone.radius_km,
          selection_id: null,
        })),
      );

    let bookingsQuery = supabase
      .from("bookings")
      .select(
        "id, service_address, address_city, address_postal_code, address_latitude, address_longitude, total_amount, travel_fee, created_at, status",
      )
      .eq("provider_id", providerId)
      .eq("location_type", "at_home");

    if (startDate) {
      bookingsQuery = bookingsQuery.gte("created_at", startDate);
    }
    if (endDate) {
      bookingsQuery = bookingsQuery.lte("created_at", endDate);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      throw bookingsError;
    }

    let isPointInZone: ((point: Coordinates, zoneData: ServiceZone) => boolean) | null = null;
    const hasGeoZones = zones.some((z) => z.zone_type === "radius" || z.zone_type === "polygon");
    if (hasGeoZones) {
      try {
        const mapbox = await getMapboxService();
        isPointInZone = mapbox.isPointInZone.bind(mapbox);
      } catch (err) {
        console.warn("[service-zones/analytics] Mapbox unavailable for geo zones:", err);
      }
    }

    const pointInZone: (point: Coordinates, zoneData: ServiceZone) => boolean =
      isPointInZone ?? (() => false);

    const zoneStats =
      zones?.map((zone) => {
        const matchingBookings =
          bookings?.filter((booking) => bookingMatchesZone(booking, zone, pointInZone)) || [];

        const totalBookings = matchingBookings.length;
        const completedBookings = matchingBookings.filter((b) => b.status === "completed").length;
        const totalRevenue = matchingBookings.reduce(
          (sum, b) => sum + parseFloat(String(b.total_amount || "0")),
          0,
        );
        const totalTravelFees = matchingBookings.reduce(
          (sum, b) => sum + parseFloat(String(b.travel_fee || "0")),
          0,
        );

        return {
          zone_id: zone.id,
          zone_name: zone.name,
          zone_type: zone.zone_type,
          is_active: zone.is_active,
          selection_id: zone.selection_id,
          total_bookings: totalBookings,
          completed_bookings: completedBookings,
          cancelled_bookings: matchingBookings.filter((b) => b.status === "cancelled").length,
          total_revenue: totalRevenue,
          total_travel_fees: totalTravelFees,
          average_booking_value: totalBookings > 0 ? totalRevenue / totalBookings : 0,
          completion_rate: totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0,
        };
      }) || [];

    const totalAtHomeBookings = bookings?.length || 0;
    const totalRevenue =
      bookings?.reduce((sum, b) => sum + parseFloat(String(b.total_amount || "0")), 0) || 0;
    const totalTravelFees =
      bookings?.reduce((sum, b) => sum + parseFloat(String(b.travel_fee || "0")), 0) || 0;

    return successResponse({
      zones: zoneStats,
      summary: {
        total_zones: zones?.length || 0,
        active_zones: zones?.filter((z) => z.is_active).length || 0,
        total_at_home_bookings: totalAtHomeBookings,
        total_revenue: totalRevenue,
        total_travel_fees: totalTravelFees,
        average_booking_value: totalAtHomeBookings > 0 ? totalRevenue / totalAtHomeBookings : 0,
      },
      period: {
        start_date: startDate || null,
        end_date: endDate || null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch zone analytics");
  }
}
