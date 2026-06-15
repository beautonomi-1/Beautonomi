import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const MAX_LOCATION_EVENTS = 100;
const MAX_BOOKING_EVENTS = 200;

/**
 * GET /api/admin/bookings/[id]/tracking
 *
 * Operational insight for a single booking: arrival lifecycle, customer
 * verification (OTP/QR), provider tracking state, precise provider location,
 * and the full activity timeline (booking_events). Answers "did the provider
 * arrive, where are they, and did the customer verify?".
 *
 * Privacy: any admin with Providers & Operations access (tenant-scoped) may see
 * precise provider GPS coordinates and raw location pings. Because this is
 * location-sensitive, every disclosure of coordinates is written to the audit
 * log (high risk). The arrival OTP/QR secret codes are NEVER returned — only
 * whether they exist, are verified, or have expired.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDERS_OPERATIONS,
      request
    );
    // Authorized ops admins (tenant-scoped by requireAdminSection) may view
    // precise location. Access is audit-logged below when coordinates exist.
    const canViewPreciseLocation = true;

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select(
        `id, provider_id, customer_id, location_type, status, current_stage,
         scheduled_at, confirmed_at, started_at, completed_at, cancelled_at,
         checked_in_time, provider_en_route_at, provider_arrived_at,
         estimated_arrival, provider_location, address_latitude, address_longitude,
         arrival_otp, arrival_otp_expires_at, arrival_otp_verified,
         qr_code_verification_code, qr_code_expires_at, qr_code_verified`
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (bookingErr) throw bookingErr;
    if (!booking) return notFoundResponse("Booking not found");

    const b = booking as Record<string, unknown>;

    const [trackingRes, eventsRes, locationCountRes] = await Promise.all([
      supabase
        .from("booking_tracking_state")
        .select("*")
        .eq("booking_id", id)
        .maybeSingle(),
      supabase
        .from("booking_events")
        .select("id, event_type, event_data, created_by, created_at")
        .eq("booking_id", id)
        .order("created_at", { ascending: true })
        .limit(MAX_BOOKING_EVENTS),
      supabase
        .from("provider_location_events")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", id),
    ]);

    if (trackingRes.error && trackingRes.error.code !== "PGRST116") {
      throw trackingRes.error;
    }
    if (eventsRes.error) throw eventsRes.error;

    const trackingState = trackingRes.data as Record<string, unknown> | null;
    const events = eventsRes.data ?? [];
    const locationEventCount = locationCountRes.count ?? 0;

    // Precise location pings for authorized ops admins (audit-logged below).
    let locationEvents: unknown[] = [];
    if (canViewPreciseLocation && locationEventCount > 0) {
      const { data: locEv, error: locErr } = await supabase
        .from("provider_location_events")
        .select("id, lat, lng, accuracy_m, speed_mps, heading_deg, recorded_at, source")
        .eq("booking_id", id)
        .order("recorded_at", { ascending: false })
        .limit(MAX_LOCATION_EVENTS);
      if (locErr) throw locErr;
      locationEvents = locEv ?? [];
    }

    const now = Date.now();
    const ts = trackingState;

    // --- Verification (never expose the actual codes) ---
    const otpPresent = !!b.arrival_otp;
    const otpVerified = !!b.arrival_otp_verified;
    const otpExpired = b.arrival_otp_expires_at
      ? new Date(b.arrival_otp_expires_at as string).getTime() < now
      : false;
    const qrPresent = !!b.qr_code_verification_code;
    const qrVerified = !!b.qr_code_verified;
    const qrExpired = b.qr_code_expires_at
      ? new Date(b.qr_code_expires_at as string).getTime() < now
      : false;

    const verificationRequired = otpPresent || qrPresent;
    const customerVerified = otpVerified || qrVerified;
    const verificationMethod = otpPresent ? "otp" : qrPresent ? "qr" : "none";

    const tsStatus = (ts?.status as string | undefined) ?? undefined;
    const providerArrived =
      !!b.provider_arrived_at ||
      b.current_stage === "provider_arrived" ||
      b.current_stage === "service_started" ||
      b.current_stage === "service_completed" ||
      ts?.arrived_at_target === true ||
      tsStatus === "arrived" ||
      tsStatus === "in_service" ||
      tsStatus === "completed";

    // Latest known provider coordinate (from booking.provider_location or tracking state)
    const pl =
      b.provider_location && typeof b.provider_location === "object"
        ? (b.provider_location as { latitude?: number; longitude?: number })
        : null;
    const lat = pl?.latitude ?? (ts?.provider_last_lat as number | undefined) ?? null;
    const lng = pl?.longitude ?? (ts?.provider_last_lng as number | undefined) ?? null;
    const providerLocation =
      canViewPreciseLocation && lat != null && lng != null
        ? { lat, lng, at: (ts?.provider_last_at as string | null) ?? null }
        : null;

    // Audit every disclosure of precise location (coordinates and/or raw pings)
    // since this is location-sensitive personal data. No-op when nothing precise
    // is exposed, to avoid noise on bookings without tracking.
    if (canViewPreciseLocation && (providerLocation || locationEvents.length > 0)) {
      const reqMeta = extractRequestMeta(request);
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role,
        action: "admin.booking.location_viewed",
        entity_type: "booking",
        entity_id: id,
        module: "providers_operations",
        risk_level: "high",
        retention_tier: "operational",
        status: "succeeded",
        metadata: {
          provider_id: (b.provider_id as string | null) ?? null,
          has_last_location: !!providerLocation,
          location_ping_count: locationEventCount,
        },
        ip_address: reqMeta.ip_address,
        user_agent: reqMeta.user_agent,
      }).catch((auditErr) => {
        console.error("Failed to write location_viewed audit log:", auditErr);
      });
    }

    return successResponse({
      booking_id: id,
      location_type: (b.location_type as string) ?? null,
      status: (b.status as string) ?? null,
      current_stage: (b.current_stage as string | null) ?? null,
      precise_location_visible: canViewPreciseLocation,

      lifecycle: {
        scheduled_at: (b.scheduled_at as string | null) ?? null,
        confirmed_at: (b.confirmed_at as string | null) ?? null,
        checked_in_time: (b.checked_in_time as string | null) ?? null,
        provider_en_route_at: (b.provider_en_route_at as string | null) ?? null,
        estimated_arrival: (b.estimated_arrival as string | null) ?? null,
        provider_arrived_at: (b.provider_arrived_at as string | null) ?? null,
        started_at: (b.started_at as string | null) ?? null,
        completed_at: (b.completed_at as string | null) ?? null,
        cancelled_at: (b.cancelled_at as string | null) ?? null,
      },

      arrival: {
        provider_arrived: providerArrived,
        customer_verified: customerVerified,
        verification_required: verificationRequired,
        verification_method: verificationMethod,
        otp_present: otpPresent,
        otp_verified: otpVerified,
        otp_expired: otpExpired,
        qr_present: qrPresent,
        qr_verified: qrVerified,
        qr_expired: qrExpired,
        arrived_distance_m: (ts?.arrived_distance_m as number | null) ?? null,
        last_distance_to_target_m:
          (ts?.last_distance_to_target_m as number | null) ?? null,
      },

      tracking_state: ts
        ? {
            status: tsStatus ?? null,
            tracking_enabled: !!ts.tracking_enabled,
            arrived_at_target: !!ts.arrived_at_target,
            arrived_at: (ts.arrived_at as string | null) ?? null,
            provider_last_at: (ts.provider_last_at as string | null) ?? null,
            last_distance_to_target_m:
              (ts.last_distance_to_target_m as number | null) ?? null,
            provider_last_lat: canViewPreciseLocation
              ? (ts.provider_last_lat as number | null) ?? null
              : null,
            provider_last_lng: canViewPreciseLocation
              ? (ts.provider_last_lng as number | null) ?? null
              : null,
          }
        : null,

      provider_location: providerLocation,
      destination:
        canViewPreciseLocation && b.address_latitude != null && b.address_longitude != null
          ? {
              lat: Number(b.address_latitude),
              lng: Number(b.address_longitude),
            }
          : null,

      location_events: locationEvents,
      location_event_count: locationEventCount,
      events,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load booking tracking");
  }
}
