import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const pingSchema = z.object({
  booking_id: z.string().uuid().optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).optional().nullable(),
  speed_mps: z.number().optional().nullable(),
  heading_deg: z.number().min(0).max(360).optional().nullable(),
  recorded_at: z.string().datetime().optional().nullable(),
  source: z.enum(["foreground", "background", "manual", "system"]).optional(),
});

function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * POST /api/provider/location/ping
 * Ingest provider location for Gods Eye live map and arrival detection.
 * - If booking_id provided: must be provider's active at_home booking; updates booking_tracking_state and arrival.
 * - Superadmin config: tracking_arrival_radius_meters from gods_eye_tracking_config.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parse = pingSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(
        parse.error.issues.map((i) => i.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "FORBIDDEN", 403);
    }

    const {
      booking_id,
      lat,
      lng,
      accuracy_m,
      speed_mps,
      heading_deg,
      recorded_at,
      source,
    } = parse.data;

    let booking: { id: string; address_latitude: number | null; address_longitude: number | null } | null = null;
    if (booking_id) {
      const { data: b, error: bookErr } = await supabase
        .from("bookings")
        .select("id, address_latitude, address_longitude, location_type, status, provider_id")
        .eq("id", booking_id)
        .eq("provider_id", providerId)
        .single();
      if (bookErr || !b) {
        return errorResponse("Booking not found or not yours", "NOT_FOUND", 404);
      }
      const bd = b as any;
      if (bd.location_type !== "at_home") {
        return errorResponse("Tracking only for at-home bookings", "VALIDATION_ERROR", 400);
      }
      if (!["confirmed", "in_progress"].includes(bd.status)) {
        return errorResponse("Booking must be confirmed or in progress", "VALIDATION_ERROR", 400);
      }
      booking = {
        id: bd.id,
        address_latitude: bd.address_latitude != null ? Number(bd.address_latitude) : null,
        address_longitude: bd.address_longitude != null ? Number(bd.address_longitude) : null,
      };
    }

    const recordedAt = recorded_at ? new Date(recorded_at).toISOString() : new Date().toISOString();

    const { error: insertErr } = await supabase.from("provider_location_events").insert({
      provider_id: providerId,
      user_id: user.id,
      booking_id: booking_id || null,
      source: source ?? "foreground",
      lat,
      lng,
      accuracy_m: accuracy_m ?? null,
      speed_mps: speed_mps ?? null,
      heading_deg: heading_deg ?? null,
      recorded_at: recordedAt,
    });

    if (insertErr) throw insertErr;

    const admin = getSupabaseAdmin();
    let arrivalRadiusM = 100;
    try {
      const { data: config } = await admin
        .from("gods_eye_tracking_config")
        .select("value")
        .eq("key", "default")
        .single();
      if (config?.value?.tracking_arrival_radius_meters != null) {
        arrivalRadiusM = Number(config.value.tracking_arrival_radius_meters);
      }
    } catch {
      // use default
    }

    if (booking && booking.address_latitude != null && booking.address_longitude != null) {
      const distanceM = haversineDistanceM(
        lat,
        lng,
        booking.address_latitude,
        booking.address_longitude
      );

      const { data: existing } = await admin
        .from("booking_tracking_state")
        .select("arrived_at_target, arrived_at, arrived_distance_m")
        .eq("booking_id", booking.id)
        .single();

      const alreadyArrived = (existing as any)?.arrived_at_target === true;
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        tracking_enabled: true,
        provider_last_lat: lat,
        provider_last_lng: lng,
        provider_last_at: recordedAt,
        customer_target_lat: booking.address_latitude,
        customer_target_lng: booking.address_longitude,
        last_distance_to_target_m: distanceM,
        updated_at: now,
      };

      if (!alreadyArrived && distanceM <= arrivalRadiusM) {
        updates.arrived_at_target = true;
        updates.arrived_at = now;
        updates.arrived_distance_m = distanceM;
        updates.status = "arrived";
      } else if (!alreadyArrived) {
        updates.status = "en_route";
      }

      await admin.from("booking_tracking_state").upsert(
        {
          booking_id: booking.id,
          ...updates,
        },
        { onConflict: "booking_id" }
      );
    }

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to record location ping");
  }
}
