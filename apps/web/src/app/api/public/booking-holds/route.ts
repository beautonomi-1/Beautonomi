/**
 * POST /api/public/booking-holds
 *
 * Create a temporary slot hold for Mangomint-style deferred auth booking.
 * No auth required - guest selects slot, hold is created, then they sign in.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { checkBookingConflict } from "@/lib/bookings/conflict-check";
import {
  checkHoldRateLimit,
  incrementHoldRateLimit,
} from "@/lib/rate-limit/hold-creation";
import { calculateTravelFeeForHold } from "@/lib/travel/calculateTravelFeeForHold";

const createHoldSchema = z.object({
  provider_id: z.string().uuid("Invalid provider ID"),
  staff_id: z.string().uuid("Invalid staff ID").optional().nullable(),
  services: z
    .array(
      z.object({
        offering_id: z.string().uuid("Invalid offering ID"),
        staff_id: z.string().uuid("Invalid staff ID").optional().nullable(),
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
    })
    .optional()
    .nullable(),
  guest_fingerprint_hash: z.string().optional().nullable(),
  resource_ids: z.array(z.string().uuid()).optional(),
});

const HOLD_EXPIRY_MINUTES = 7;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createHoldSchema.safeParse(body);

    if (!parsed.success) {
      return handleApiError(
        new Error(parsed.error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
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
      resource_ids,
    } = parsed.data;

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

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    // Rate limiting
    const rateLimit = checkHoldRateLimit(request, guest_fingerprint_hash || null);
    if (!rateLimit.allowed) {
      return handleApiError(
        new Error(rateLimit.reason),
        rateLimit.reason!,
        "RATE_LIMIT_EXCEEDED",
        429
      );
    }

    // Max 1 active, non-expired hold per fingerprint
    if (guest_fingerprint_hash) {
      const { data: activeHold } = await supabase
        .from("booking_holds")
        .select("id")
        .eq("guest_fingerprint_hash", guest_fingerprint_hash)
        .eq("hold_status", "active")
        .gt("expires_at", nowIso)
        .limit(1)
        .maybeSingle();
      if (activeHold) {
        return handleApiError(
          new Error("You already have an active booking hold. Please complete or cancel it first."),
          "You already have an active booking hold. Please complete or cancel it first.",
          "ACTIVE_HOLD_EXISTS",
          429
        );
      }
    }

    // Load provider
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, currency, status")
      .eq("id", provider_id)
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

    const currency = provider.currency || "ZAR";

    // Load offerings and build snapshot
    const offeringIds = services.map((s) => s.offering_id);
    const { data: offerings, error: offeringsError } = await supabase
      .from("offerings")
      .select(
        "id, provider_id, duration_minutes, buffer_minutes, price, currency, is_active, at_home_price_adjustment, supports_at_home"
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
    const staffId = bodyStaffId ?? services[0]?.staff_id ?? null;

    // Build booking_services_snapshot
    let cursor = new Date(startDate);
    const bookingServicesSnapshot: Array<{
      offering_id: string;
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
      bookingServicesSnapshot.push({
        offering_id: off.id,
        staff_id: s.staff_id ?? staffId,
        duration_minutes: duration,
        price,
        currency: off.currency || currency,
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
      });
      cursor = new Date(end.getTime() + Number(off.buffer_minutes || 0) * 60000);
    }

    const lastOffering = offeringById.get(services[services.length - 1].offering_id);
    const bufferMinutes = Number(lastOffering?.buffer_minutes || 15);
    // If client sent full block end (slot start + totalSpan including last buffer), don't add buffer again
    const expectedBlockEnd = new Date(cursor.getTime() + bufferMinutes * 60000);
    const clientSentFullSpan = endDate.getTime() >= expectedBlockEnd.getTime() - 60000;
    const bufferForConflict = clientSentFullSpan ? 0 : bufferMinutes;

    // Check for conflicts: existing bookings (skip when staff_id is null / "anyone" mode)
    if (staffId) {
      const conflictResult = await checkBookingConflict(
        supabase as any,
        staffId,
        startDate,
        endDate,
        bufferForConflict
      );
      if (conflictResult.hasConflict) {
        return handleApiError(
          new Error("This time slot is no longer available. Please select another time."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
      }
    }

    // Check for overlapping active, non-expired holds: same staff, or same provider when staff_id is null (anyone mode)
    const overlapQuery = supabase
      .from("booking_holds")
      .select("id")
      .eq("hold_status", "active")
      .gt("expires_at", nowIso)
      .lt("start_at", endDate.toISOString())
      .gt("end_at", startDate.toISOString());
    if (staffId) {
      overlapQuery.eq("staff_id", staffId);
    } else {
      overlapQuery.eq("provider_id", provider_id);
    }
    const { data: overlappingHolds } = await overlapQuery.limit(1);

    if (overlappingHolds && overlappingHolds.length > 0) {
      return handleApiError(
        new Error("This time slot is no longer available. Please select another time."),
        "This time slot is no longer available. Please select another time.",
        "CONFLICT",
        409
      );
    }

    // Location validation
    if (location_type === "at_salon" && !location_id) {
      return handleApiError(
        new Error("location_id is required for at_salon bookings"),
        "location_id is required for at_salon",
        "VALIDATION_ERROR",
        400
      );
    }
    if (location_type === "at_home" && !address) {
      return handleApiError(
        new Error("address is required for at_home bookings"),
        "address is required for at_home",
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

    const expiresAt = new Date(Date.now() + HOLD_EXPIRY_MINUTES * 60 * 1000);

    const { data: hold, error: insertError } = await supabase
      .from("booking_holds")
      .insert({
        provider_id,
        staff_id: staffId,
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
        return handleApiError(
          new Error("This time slot is no longer available. Please select another time."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
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

    return successResponse({
      hold_id: hold.id,
      expires_at: hold.expires_at,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create booking hold");
  }
}
