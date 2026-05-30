/**
 * POST /api/public/booking-holds
 *
 * Create a temporary slot hold for Mangomint-style deferred auth booking.
 * No auth required - guest selects slot, hold is created, then they sign in.
 */

import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizePublicStaffIdForDatabase } from "@beautonomi/utils";
import { checkBookingSnapshotSegmentConflicts } from "@/lib/bookings/conflict-check";
import { withRouteMetrics } from "@/lib/monitoring/route-metrics";
import { applyRateLimitHeaders } from "@/lib/rate-limit/headers";
import {
  checkHoldRateLimit,
  incrementHoldRateLimit,
} from "@/lib/rate-limit/hold-creation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { bookingHoldSlotUnavailableResponse } from "@/lib/public-booking/booking-hold-slot-errors";
import { verifyPublicBookingCaptcha } from "@/lib/security/captcha";
import {
  extractIdempotencyKey,
  lookupIdempotentResponse,
  rememberIdempotentResponse,
} from "@/lib/http/idempotency";
import { evaluateMarketAvailabilityFromRequest } from "@/lib/tenant/market-availability";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { calculateTravelFeeForHold } from "@/lib/travel/calculateTravelFeeForHold";
import { zPublicBookingStaffIdOptional } from "@/lib/public-booking/zod-public-staff-id";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { holdGridDurationMinutesFromSnapshot } from "@/lib/booking-slot-math/blocked-window-minutes";
import { assertPublicSlotBookable } from "@/lib/provider-booking/assert-public-slot-bookable";

const PUBLIC_BOOKING_HOLDS_ENDPOINT = "POST /api/public/booking-holds";

const createHoldSchema = z.object({
  provider_id: z.string().uuid("Invalid provider ID"),
  staff_id: zPublicBookingStaffIdOptional,
  services: z
    .array(
      z.object({
        offering_id: z.string().uuid("Invalid offering ID"),
        staff_id: zPublicBookingStaffIdOptional,
      })
    )
    .min(1, "At least one service is required"),
  start_at: z.string().datetime("Invalid start datetime"),
  end_at: z.string().datetime("Invalid end datetime"),
  location_type: z.enum(["at_home", "at_salon"]),
  location_id: z.string().uuid().optional().nullable(),
  address: z
    .object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().optional(),
      country: z.string().min(1),
      postal_code: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      apartment_unit: z.string().optional().nullable(),
      building_name: z.string().optional().nullable(),
      floor_number: z.string().optional().nullable(),
      access_codes: z.record(z.string(), z.string()).optional().nullable(),
      parking_instructions: z.string().optional().nullable(),
      location_landmarks: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  guest_fingerprint_hash: z.string().optional().nullable(),
  previous_hold_id: z.string().uuid().optional().nullable(),
  exclude_booking_id: z.string().uuid().optional().nullable(),
  resource_ids: z.array(z.string().uuid()).optional(),
  /** Must match the travel buffer used by availability for at-home slots. */
  availability_travel_buffer_minutes: z.coerce.number().int().min(0).max(360).optional(),
  /** `service_packages.id` — stored on hold metadata for checkout / edit-booking restore */
  package_id: z.string().uuid().optional().nullable(),
  primary_package_id: z.string().uuid().optional().nullable(),
  /**
   * §Release-audit 2026-04: when the slot came from an any-staff union,
   * the availability engine emitted the list of staff who were free at
   * this wall-clock time. Passing them here preserves the calendar's
   * choice through the hold resolver so concurrent bookings against the
   * same "anyone" timeslot deterministically pick different staff.
   */
  preferred_staff_ids: z.array(z.string().uuid()).optional().nullable(),
});

const HOLD_EXPIRY_MINUTES = 20;
/** Abandoned checkout holds can stick in `consuming` — release before evaluating overlap. */
const STALE_CONSUMING_HOLD_MINUTES = 15;

type HoldOverlapScopeArgs = {
  supabase: SupabaseClient;
  providerId: string;
  staffId: string | null;
  startAtIso: string;
  endAtIso: string;
  nowIso: string;
};

async function expireStaleOverlappingHoldsForScope(args: HoldOverlapScopeArgs): Promise<void> {
  // Expire ALL past-due holds for this provider in the overlapping time range,
  // regardless of staff_id. This prevents stale holds from a different staff
  // resolution from blocking the current request.
  const { error } = await args.supabase
    .from("booking_holds")
    .update({ hold_status: "expired", consuming_at: null })
    .eq("provider_id", args.providerId)
    .in("hold_status", ["active", "consuming"])
    .lte("expires_at", args.nowIso)
    .lt("start_at", args.endAtIso)
    .gt("end_at", args.startAtIso);
  if (error) {
    console.warn("[booking-holds] stale hold expiry failed (inline cleanup):", error.message);
  }
}

type HoldOverlapResult = { id: string; guest_fingerprint_hash: string | null }[];

async function findActiveHoldOverlapsForScope(args: HoldOverlapScopeArgs): Promise<HoldOverlapResult> {
  const query = args.staffId
    ? args.supabase
        .from("booking_holds")
        .select("id, guest_fingerprint_hash")
        .eq("provider_id", args.providerId)
        .eq("staff_id", args.staffId)
        .in("hold_status", ["active", "consuming"])
        .gt("expires_at", args.nowIso)
        .lt("start_at", args.endAtIso)
        .gt("end_at", args.startAtIso)
        .limit(5)
    : args.supabase
        .from("booking_holds")
        .select("id, guest_fingerprint_hash")
        .eq("provider_id", args.providerId)
        .is("staff_id", null)
        .in("hold_status", ["active", "consuming"])
        .gt("expires_at", args.nowIso)
        .lt("start_at", args.endAtIso)
        .gt("end_at", args.startAtIso)
        .limit(5);
  const { data, error } = await query;
  if (error) {
    console.error("[booking-holds] overlap query failed:", error.message);
    return [];
  }
  return (data as HoldOverlapResult) ?? [];
}

export async function POST(request: NextRequest) {
  return withRouteMetrics(
    request,
    "/api/public/booking-holds",
    "POST",
    async () => {
      try {
        const body = await request.json();
        const parsed = createHoldSchema.safeParse(body);

        if (!parsed.success) {
          const message = parsed.error.issues
            .map((e) => {
              const field = e.path.length > 0 ? e.path.join(".") : null;
              return field ? `${field}: ${e.message}` : e.message;
            })
            .join(", ");
          return handleApiError(
            new Error(message),
            "Validation failed",
            "VALIDATION_ERROR",
            400
          );
        }

        // Wave 2.1 (audit 2026-04 final 100/100): server-side idempotency
        // for booking-holds. Prevents duplicate hold rows + spurious slot
        // contention when a flaky network causes the mobile/web client to
        // retry the same request. The hold-creation flow already does
        // generous internal de-dup (cancel-on-fingerprint, exclusion
        // constraint), but a UUID-keyed cached replay is the only way to
        // give the *client* a deterministic 200 response on retry.
        const holdIdempotencyKey = extractIdempotencyKey(request, body);
        if (holdIdempotencyKey) {
          const cached = await lookupIdempotentResponse(
            PUBLIC_BOOKING_HOLDS_ENDPOINT,
            holdIdempotencyKey,
          );
          if (cached) return cached.toResponse();
        }

        // Wave 1.5 (audit 2026-04 final 100/100): CAPTCHA guard for
        // anonymous booking-holds. Previously this surface had no CAPTCHA
        // at all, so a single attacker IP could mint thousands of holds
        // and starve the calendar (the booking-create CAPTCHA was useless
        // because the slot was already locked by the unprotected hold).
        // We do a real Supabase-server auth check first; only verified
        // logged-in users skip the captcha. Pass the request so mobile
        // Bearer-authenticated customers are recognized the same as web
        // cookie-authenticated customers.
        let holdCaptchaSkipUserId: string | null = null;
        try {
          const sbServer = await getSupabaseServer(request);
          const { data: pre } = await sbServer.auth.getUser();
          holdCaptchaSkipUserId = pre?.user?.id ?? null;
        } catch {
          holdCaptchaSkipUserId = null;
        }
        const holdCaptcha = await verifyPublicBookingCaptcha(request, body, {
          skipForUserId: holdCaptchaSkipUserId,
        });
        if (holdCaptcha.ok === false) {
          return errorResponse(
            holdCaptcha.reason,
            "CAPTCHA_REQUIRED",
            holdCaptcha.status,
          );
        }

        const {
          provider_id,
          staff_id: bodyStaffId,
          services,
          start_at,
          end_at,
          location_type,
          location_id,
          address,
          guest_fingerprint_hash,
          previous_hold_id,
          exclude_booking_id,
          resource_ids,
          availability_travel_buffer_minutes,
          package_id: bodyPackageId,
          primary_package_id: bodyPrimaryPackageId,
          preferred_staff_ids: bodyPreferredStaffIds,
        } = parsed.data;
        const packageIdForHold =
          (bodyPackageId?.trim() || bodyPrimaryPackageId?.trim()) || undefined;

        const startDate = new Date(start_at);
        const endDate = new Date(end_at);
        if (endDate <= startDate) {
          return handleApiError(
            new Error("end_at must be after start_at"),
            "Invalid time range",
            "VALIDATION_ERROR",
            400
          );
        }

        const tenantRes = await requirePublicTenant(request);
        if (tenantRes instanceof Response) {
          return tenantRes;
        }
        const { tenantId } = tenantRes;

        const marketAvailability = evaluateMarketAvailabilityFromRequest(request);
        if (marketAvailability.status === "restricted") {
          return handleApiError(
            new Error("Access unavailable for this country"),
            "Access unavailable in your country due to legal or regulatory restrictions.",
            "COUNTRY_RESTRICTED",
            451,
          );
        }

        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();

        const { data: tenant } = await supabase
          .from("tenants")
          .select("slug")
          .eq("id", tenantId)
          .maybeSingle();

        if ((tenant as { slug?: string } | null)?.slug === "global") {
          return handleApiError(
            new Error("Bookings are unavailable on global entry"),
            "Please switch to an available market to continue booking.",
            "MARKET_SWITCH_REQUIRED",
            403,
          );
        }

        // Rate limiting
        const rateLimit = await checkHoldRateLimit(request, guest_fingerprint_hash || null);
        if (!rateLimit.allowed) {
          const response = handleApiError(
            new Error(rateLimit.reason),
            rateLimit.reason!,
            "RATE_LIMIT_EXCEEDED",
            429
          );
          return applyRateLimitHeaders(response, {
            remaining: 0,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          });
        }

        // Release a specific previous hold if the client tells us about it
        if (previous_hold_id) {
          await supabase
            .from("booking_holds")
            .update({ hold_status: "cancelled" })
            .eq("id", previous_hold_id)
            .in("hold_status", ["active", "consuming"]);
        }

        // Cancel any existing active holds from the same client so a retry
        // doesn't collide with the user's own stale hold.
        if (guest_fingerprint_hash) {
          await supabase
            .from("booking_holds")
            .update({ hold_status: "cancelled" })
            .eq("guest_fingerprint_hash", guest_fingerprint_hash)
            .in("hold_status", ["active", "consuming"])
            .eq("provider_id", provider_id);
        }

        // Load provider
        const { data: provider, error: providerError } = await supabase
          .from("providers")
          .select("id, currency, status, business_name, timezone")
          .eq("id", provider_id)
          .eq("tenant_id", tenantId)
          .single();

        if (providerError || !provider) {
          return handleApiError(
            new Error("Provider not found"),
            "Provider not found",
            "NOT_FOUND",
            404
          );
        }

        if (provider.status !== "active") {
          return handleApiError(
            new Error("Provider is not available for booking"),
            "Provider is not available",
            "PROVIDER_INACTIVE",
            400
          );
        }

        const staleConsumingBefore = new Date(
          Date.now() - STALE_CONSUMING_HOLD_MINUTES * 60 * 1000,
        ).toISOString();
        await supabase
          .from("booking_holds")
          .update({ hold_status: "expired", consuming_at: null })
          .eq("provider_id", provider_id)
          .eq("hold_status", "consuming")
          .not("consuming_at", "is", null)
          .lt("consuming_at", staleConsumingBefore);

        const tenantRegion = await getTenantRegionConfig(tenantId);
        const currency = provider.currency || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;

        // Load offerings and build snapshot
        const offeringIds = services.map((s) => s.offering_id);
        const { data: offerings, error: offeringsError } = await supabase
          .from("offerings")
          .select(
            "id, title, provider_id, duration_minutes, buffer_minutes, price, currency, is_active, at_home_price_adjustment, supports_at_home, online_booking_enabled, service_type"
          )
          .in("id", offeringIds);

        if (offeringsError) throw offeringsError;

        const offeringById = new Map(
          (offerings || []).map((o) => [o.id, o])
        );

        for (const s of services) {
          const off = offeringById.get(s.offering_id);
          if (!off || off.provider_id !== provider_id || !off.is_active) {
            return handleApiError(
              new Error("Invalid service selection"),
              "Invalid service selection",
              "VALIDATION_ERROR",
              400
            );
          }
          // §Release-audit 2026-04: mirror validate-booking so a hold
          // cannot tie up calendar time for an offline-only service or
          // an addon offering submitted as a main service line. Variants
          // are legitimate bookable services (their own price/duration
          // row in `offerings`) and are what the StepServices UI submits
          // when a service has variants, so they are NOT rejected here.
          if ((off as { online_booking_enabled?: boolean }).online_booking_enabled === false) {
            return handleApiError(
              new Error("Service is not available for online booking"),
              "This service can only be booked by contacting the provider directly.",
              "ONLINE_BOOKING_DISABLED",
              400
            );
          }
          const svcType = (off as { service_type?: string | null }).service_type;
          if (svcType === "addon") {
            return handleApiError(
              new Error("Non-service offering submitted as service"),
              "Invalid service selection",
              "VALIDATION_ERROR",
              400
            );
          }
          if (
            location_type === "at_home" &&
            off.supports_at_home === false
          ) {
            return handleApiError(
              new Error("One or more services do not support at-home"),
              "At-home not supported",
              "VALIDATION_ERROR",
              400
            );
          }
        }

        // Resolve staff_id: use body staff_id or first service's staff_id. null = "anyone" mode (assign at confirm).
        // Synthetic `provider-{uuid}` is not a DB FK — store null on hold + snapshot; keep token in metadata.
        const rawStaffKey = bodyStaffId ?? services[0]?.staff_id ?? null;
        const { dbStaffId: holdStaffIdForDb, syntheticToken: syntheticStaffPublicId } =
          normalizePublicStaffIdForDatabase(rawStaffKey ?? undefined);

        await expireStaleOverlappingHoldsForScope({
          supabase,
          providerId: provider_id,
          staffId: holdStaffIdForDb,
          startAtIso: startDate.toISOString(),
          endAtIso: endDate.toISOString(),
          nowIso,
        });

        const scopeOverlaps = await findActiveHoldOverlapsForScope({
          supabase,
          providerId: provider_id,
          staffId: holdStaffIdForDb,
          startAtIso: startDate.toISOString(),
          endAtIso: endDate.toISOString(),
          nowIso,
        });
        if (scopeOverlaps.length > 0) {
          // If all overlapping holds belong to this same guest, cancel them and proceed
          if (
            guest_fingerprint_hash &&
            scopeOverlaps.every((h) => h.guest_fingerprint_hash === guest_fingerprint_hash)
          ) {
            await supabase
              .from("booking_holds")
              .update({ hold_status: "cancelled" })
              .in("id", scopeOverlaps.map((h) => h.id));
          } else {
            return bookingHoldSlotUnavailableResponse("SLOT_TAKEN_BY_HOLD");
          }
        }

        // Build booking_services_snapshot
        let cursor = new Date(startDate);
        const bookingServicesSnapshot: Array<{
          offering_id: string;
          service_name?: string;
          staff_id: string | null;
          duration_minutes: number;
          price: number;
          currency: string;
          scheduled_start_at: string;
          scheduled_end_at: string;
        }> = [];

        for (const s of services) {
          const off = offeringById.get(s.offering_id);
          if (!off) continue;
          const duration = Number(off.duration_minutes || 0);
          const price =
            location_type === "at_home" && off.at_home_price_adjustment
              ? Number(off.price || 0) + Number(off.at_home_price_adjustment || 0)
              : Number(off.price || 0);
          const start = new Date(cursor);
          const end = new Date(cursor.getTime() + duration * 60000);
          const lineRaw = s.staff_id ?? rawStaffKey ?? null;
          const { dbStaffId: lineStaffDb } = normalizePublicStaffIdForDatabase(lineRaw ?? undefined);
          bookingServicesSnapshot.push({
            offering_id: off.id,
            service_name: (off as { title?: string }).title?.trim() || undefined,
            staff_id: lineStaffDb ?? holdStaffIdForDb,
            duration_minutes: duration,
            price,
            currency: off.currency || currency,
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
          });
          cursor = new Date(end.getTime() + Number(off.buffer_minutes || 0) * 60000);
        }

        const offeringBufferMinutesById = new Map<string, number>(
          Array.from(offeringById.entries()).map(([id, o]) => [
            id,
            // Keep parity with public availability: missing/invalid buffer = 0, not 15.
            Number(o.buffer_minutes ?? 0),
          ])
        );

        const rawProviderTz = (provider as { timezone?: string | null }).timezone;
        const providerTz =
          normalizeProviderTimezone(rawProviderTz) ?? DEFAULT_BOOKING_DISPLAY_TIMEZONE;
        const travelBufferMinsForHold =
          location_type === "at_home"
            ? Number(availability_travel_buffer_minutes ?? 0)
            : 0;

        const allSnapshotStaffNull = bookingServicesSnapshot.every((s) => !s.staff_id);
        if (allSnapshotStaffNull) {
          const { pickFirstStaffForNullStaffLines } = await import(
            "@/lib/bookings/resolve-any-staff-for-public-booking"
          );
          const locationIdForCalendarPick =
            location_type === "at_salon" ? location_id ?? null : null;
          const picked = await pickFirstStaffForNullStaffLines({
            supabaseAdmin: supabase as SupabaseClient,
            providerId: provider_id,
            locationId: locationIdForCalendarPick,
            bookingServicesData: bookingServicesSnapshot.map((s) => ({
              offering_id: s.offering_id,
              staff_id: s.staff_id,
              scheduled_start_at: s.scheduled_start_at,
              scheduled_end_at: s.scheduled_end_at,
            })),
            offeringBufferMinutesById,
            providerTimeZone: providerTz,
            travelBufferMinutes: travelBufferMinsForHold,
            preferredStaffIds: bodyPreferredStaffIds ?? undefined,
          });
          if (picked.ok) {
            for (const s of bookingServicesSnapshot) {
              s.staff_id = picked.staffId;
            }
          } else {
            return bookingHoldSlotUnavailableResponse("NO_STAFF_AVAILABLE");
          }
        }

        const conflictResult = await checkBookingSnapshotSegmentConflicts(
          supabase as SupabaseClient,
          provider_id,
          bookingServicesSnapshot,
          offeringBufferMinutesById,
          exclude_booking_id || undefined
        );
        if (conflictResult.hasConflict) {
          return bookingHoldSlotUnavailableResponse("CONFLICT_SNAPSHOT");
        }

        const locationIdForCalendar =
          location_type === "at_salon" ? location_id ?? null : null;

        // Provider-portal parity: shared grid preflight (min-notice=0).
        // Blocked span = duration + buffers only; travel via travelBufferRaw (not doubled).
        {
          const gridDur = holdGridDurationMinutesFromSnapshot({
            startAt: startDate,
            snapshotLines: bookingServicesSnapshot,
            bufferMinutesByOfferingId: offeringBufferMinutesById,
          });
          const staffSet = [
            ...new Set(
              bookingServicesSnapshot
                .map((line) => line.staff_id)
                .filter((id): id is string => Boolean(id)),
            ),
          ];
          const slotEval = await assertPublicSlotBookable(supabase as SupabaseClient, {
            providerId: provider_id,
            scheduledAt: startDate,
            durationMinutes: gridDur,
            staffIdsCsv: staffSet.length > 0 ? staffSet.join(",") : null,
            locationId: locationIdForCalendar,
            excludeBookingId: exclude_booking_id || undefined,
            mode: location_type === "at_home" ? "mobile" : "salon",
            travelBufferRaw:
              location_type === "at_home" ? String(travelBufferMinsForHold) : "0",
            resourceOfferingIds: offeringIds,
          });
          if (!slotEval.ok) {
            console.warn(
              "[booking-holds] grid preflight failed:",
              slotEval.conflicts,
              { provider_id, start: startDate.toISOString(), gridDur },
            );
            return bookingHoldSlotUnavailableResponse("OUTSIDE_WORKING_HOURS");
          }
        }
        {
          const { isProviderCalendarWindowBlocked } = await import(
            "@/lib/public-booking/provider-calendar-block-overlap"
          );
          for (const line of bookingServicesSnapshot) {
            const segStart = new Date(line.scheduled_start_at);
            const segEnd = new Date(line.scheduled_end_at);
            const buf = offeringBufferMinutesById.get(line.offering_id) ?? 0;
            const effectiveEnd = new Date(segEnd.getTime() + buf * 60000);
            const cal = await isProviderCalendarWindowBlocked(supabase, {
              providerId: provider_id,
              locationId: locationIdForCalendar,
              staffId: line.staff_id ?? null,
              startAt: segStart,
              endAt: effectiveEnd,
            });
            if (cal.blocked) {
              return bookingHoldSlotUnavailableResponse("CALENDAR_BLOCKED");
            }
          }
        }

        // Overlapping active holds: any snapshot staff line, or provider "anyone" holds when no specific staff.
        // First expire any stale (past-due) holds for the resolved staff scope — the earlier
        // broad expiry targeted holdStaffIdForDb which may differ after "anyone" staff resolution.
        const distinctSnapshotStaffIds = [
          ...new Set(
            bookingServicesSnapshot
              .map((l) => l.staff_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];

        if (distinctSnapshotStaffIds.length > 0) {
          await supabase
            .from("booking_holds")
            .update({ hold_status: "expired", consuming_at: null })
            .eq("provider_id", provider_id)
            .in("hold_status", ["active", "consuming"])
            .lte("expires_at", nowIso)
            .lt("start_at", endDate.toISOString())
            .gt("end_at", startDate.toISOString())
            .in("staff_id", distinctSnapshotStaffIds);
        }

        let overlappingHolds: { id: string; guest_fingerprint_hash: string | null }[] | null = null;
        if (distinctSnapshotStaffIds.length > 0) {
          const { data } = await supabase
            .from("booking_holds")
            .select("id, guest_fingerprint_hash")
            .eq("provider_id", provider_id)
            .in("hold_status", ["active", "consuming"])
            .gt("expires_at", nowIso)
            .lt("start_at", endDate.toISOString())
            .gt("end_at", startDate.toISOString())
            .in("staff_id", distinctSnapshotStaffIds)
            .limit(5);
          overlappingHolds = data;
        } else {
          const { data: anyoneOverlaps } = await supabase
            .from("booking_holds")
            .select("id, guest_fingerprint_hash")
            .in("hold_status", ["active", "consuming"])
            .gt("expires_at", nowIso)
            .lt("start_at", endDate.toISOString())
            .gt("end_at", startDate.toISOString())
            .eq("provider_id", provider_id)
            .is("staff_id", null)
            .limit(5);
          overlappingHolds = anyoneOverlaps;
        }

        if (overlappingHolds && overlappingHolds.length > 0) {
          // If ALL overlapping holds belong to this same guest, cancel them and proceed
          if (
            guest_fingerprint_hash &&
            overlappingHolds.every((h) => h.guest_fingerprint_hash === guest_fingerprint_hash)
          ) {
            await supabase
              .from("booking_holds")
              .update({ hold_status: "cancelled" })
              .in("id", overlappingHolds.map((h) => h.id));
          } else {
            return bookingHoldSlotUnavailableResponse("SLOT_TAKEN_BY_HOLD");
          }
        }

        // Location validation — at_home address is optional for holds (collected
        // later in the flow); travel fee is simply skipped when absent.
        if (location_type === "at_salon" && !location_id) {
          return handleApiError(
            new Error("location_id is required for at_salon bookings"),
            "location_id is required for at_salon",
            "VALIDATION_ERROR",
            400
          );
        }

        let holdMetadata: Record<string, unknown> = {};
        if (location_type === "at_home" && address && address.latitude != null && address.longitude != null) {
          try {
            const travelResult = await calculateTravelFeeForHold(supabase, provider_id, {
              latitude: address.latitude,
              longitude: address.longitude,
              line1: address.line1,
              city: address.city,
              country: address.country,
              postal_code: address.postal_code,
            });
            holdMetadata = {
              travel_fee: travelResult.withinServiceArea ? travelResult.travelFee : 0,
              travel_distance_km: travelResult.distanceKm,
            };
          } catch {
            holdMetadata = { travel_fee: 0, travel_distance_km: 0 };
          }
        }
        if (resource_ids && resource_ids.length > 0) {
          holdMetadata = { ...holdMetadata, resource_ids };
        }
        if (location_type === "at_home" && availability_travel_buffer_minutes != null) {
          holdMetadata = {
            ...holdMetadata,
            availability_travel_buffer_minutes,
          };
        }
        if (syntheticStaffPublicId) {
          holdMetadata = {
            ...holdMetadata,
            public_booking_staff_id: syntheticStaffPublicId,
            solo_staff_display_name: (provider as { business_name?: string | null }).business_name ?? undefined,
          };
        }
        if (packageIdForHold) {
          holdMetadata = { ...holdMetadata, package_id: packageIdForHold };
        }
        if (bodyPreferredStaffIds && bodyPreferredStaffIds.length > 0) {
          holdMetadata = { ...holdMetadata, preferred_staff_ids: bodyPreferredStaffIds };
        }

        const expiresAt = new Date(Date.now() + HOLD_EXPIRY_MINUTES * 60 * 1000);

        const { data: hold, error: insertError } = await supabase
          .from("booking_holds")
          .insert({
            provider_id,
            staff_id: holdStaffIdForDb,
            booking_services_snapshot: bookingServicesSnapshot,
            start_at: start_at,
            end_at: end_at,
            location_type,
            location_id: location_id || null,
            address_snapshot: address || null,
            hold_status: "active",
            expires_at: expiresAt.toISOString(),
            created_by_user_id: null,
            guest_fingerprint_hash: guest_fingerprint_hash || null,
            metadata: holdMetadata,
          })
          .select("id, expires_at")
          .single();

        if (insertError) {
          // DB exclusion constraint: only one active non-expired hold per (staff|provider) and time range
          const err = insertError as { code?: string; details?: string; message?: string };
          const isExclusionViolation =
            err.code === "23P01" ||
            [err.details, err.message].some(
              (t) =>
                t &&
                (t.includes("booking_holds_no_overlap_staff") ||
                  t.includes("booking_holds_no_overlap_provider_anyone"))
            );
          if (isExclusionViolation) {
            return bookingHoldSlotUnavailableResponse("SLOT_TAKEN_BY_HOLD");
          }
          throw insertError;
        }

        incrementHoldRateLimit(request, guest_fingerprint_hash || null);

        if (!hold) {
          return handleApiError(
            new Error("Failed to create hold"),
            "Failed to create hold",
            "CREATE_ERROR",
            500
          );
        }

        const successBody = {
          hold_id: hold.id,
          expires_at: hold.expires_at,
        };
        if (holdIdempotencyKey) {
          // Match successResponse shape so a replay returns the same
          // envelope a fresh call would produce.
          await rememberIdempotentResponse(
            PUBLIC_BOOKING_HOLDS_ENDPOINT,
            holdIdempotencyKey,
            { status: 200, body: { data: successBody, error: null } },
          );
        }
        return successResponse(successBody);
      } catch (error) {
        return handleApiError(error, "Failed to create booking hold");
      }
    },
  );
}
