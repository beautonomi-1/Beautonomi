import { NextRequest } from "next/server";
import { isUuidString, SYNTHETIC_PROVIDER_STAFF_PREFIX } from "@beautonomi/utils";
import {
  availabilitySlotsAsTimeSlots,
  computePublicSlugAvailabilitySlots,
} from "@/lib/availability/public-slug-availability-engine";
import { parseSyntheticProviderStaffId } from "@/lib/availability/load-constraints";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import type { TimeSlot } from "@/lib/availability/types";
import {
  getProviderIdForUser,
  handleApiError,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/availability
 *
 * Available time slots for a staff member on a specific date.
 *
 * B12: this route now delegates to the same engine as the public-slug
 * availability endpoint (`/api/public/providers/[slug]/availability`) and the
 * portal reschedule endpoint (`/api/portal/availability`) via
 * {@link computePublicSlugAvailabilitySlots}. We flatten the shared
 * `AvailabilitySlot[]` contract back to the legacy `{ time, available }` shape
 * for existing callers (`/booking` step-calendar, mobile `AvailabilitySlotPicker`)
 * through {@link availabilitySlotsAsTimeSlots}. New callers should use
 * `/api/public/providers/[slug]/availability` directly (ISO start/end + staff_id).
 *
 * Query params: staffId, providerId, date, mode, duration, travelBuffer,
 *   avoidGaps (unused — now honoured via providerSettings.avoidGaps),
 *   excludeHoldId, locationId, excludeBookingId.
 *
 * **`staffId=any` (or omitted):** returns **no slots** unless **`providerId`** (provider UUID)
 * is passed — then slots are the **union** of availability across active staff
 * (or the synthetic solo `provider-{uuid}` staff when the provider has no
 * `provider_staff` rows), matching the public slug endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const staffIdRaw = searchParams.get("staffId");
    const providerIdParam = searchParams.get("providerId")?.trim() || undefined;
    const date = searchParams.get("date");
    const mode = searchParams.get("mode") || "salon";
    const duration = parseInt(searchParams.get("duration") || "60", 10);
    const travelBuffer = parseInt(searchParams.get("travelBuffer") || "0", 10);
    const excludeHoldId =
      searchParams.get("excludeHoldId")?.trim() || undefined;
    const excludeBookingId =
      searchParams.get("exclude_booking_id")?.trim() || undefined;
    const locationId = searchParams.get("locationId")?.trim() || undefined;

    if (!date) {
      return successResponse({ date, slots: [] });
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return handleApiError(
        new Error("Database connection failed"),
        "Failed to connect to database",
      );
    }

    let authenticatedProviderId: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        authenticatedProviderId = await getProviderIdForUser(user.id, supabase);
      }
    } catch {
      // Auth is optional — swallow errors and continue as public
    }

    const staffIdTrim = staffIdRaw?.trim() ?? "";
    const wantsAnyStaff = !staffIdTrim || staffIdTrim === "any";

    // Resolve the provider id the shared engine needs. For explicit staff ids
    // we look up the provider row so settings (avoid_gaps, timezone) and
    // calendar-parity data are honoured. For any-staff requests the caller
    // must pass providerId (same rule as before).
    let providerIdForEngine: string | undefined = providerIdParam;
    if (!providerIdForEngine && !wantsAnyStaff) {
      const synthetic = parseSyntheticProviderStaffId(staffIdTrim);
      if (synthetic) {
        providerIdForEngine = synthetic;
      } else if (!staffIdTrim.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX)) {
        const admin = getSupabaseAdmin();
        const { data: staffRow } = await admin
          .from("provider_staff")
          .select("provider_id")
          .eq("id", staffIdTrim)
          .maybeSingle();
        providerIdForEngine = staffRow?.provider_id ?? undefined;
      }
    }

    // Any-staff requires providerId (same contract as before).
    if (wantsAnyStaff && (!providerIdForEngine || !isUuidString(providerIdForEngine))) {
      return successResponse({ date, slots: [] });
    }

    // Load active staff rows when doing an any-staff union. Mirrors the same
    // query as the public slug endpoint so both routes converge.
    let activeStaffRows: Array<{ id: string }> = [];
    if (wantsAnyStaff && providerIdForEngine) {
      const { data: staffRows } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("provider_id", providerIdForEngine)
        .eq("is_active", true);
      activeStaffRows = (staffRows || []).map((r: { id: string }) => ({
        id: r.id,
      }));
    }

    if (!providerIdForEngine) {
      // No provider context available — the shared engine requires it.
      return successResponse({ date, slots: [] });
    }

    // §Release-audit 2026-04: load the provider's IANA timezone so slot
    // instants are correctly anchored to the provider's wall clock rather
    // than the server's TZ. Without this the engine emits HH:MM as if UTC,
    // and the booking flow's `parseSelectedDatetimeInProviderTz` then
    // interprets that HH:MM as provider-local — shifting the instant and
    // triggering "invalid time / slot taken" in non-UTC deployments.
    let providerTimeZone: string | null = null;
    let providerTimeZoneRaw: string | null = null;
    let providerMinNotice: number | null = null;
    let providerMaxAdvance: number | null = null;
    try {
      const admin = getSupabaseAdmin();
      const [{ data: providerRow }, { data: onlineSettings }] = await Promise.all([
        admin
          .from("providers")
          .select("timezone")
          .eq("id", providerIdForEngine)
          .maybeSingle(),
        admin
          .from("provider_online_booking_settings")
          .select("min_notice_minutes, max_advance_days")
          .eq("provider_id", providerIdForEngine)
          .maybeSingle(),
      ]);
      providerTimeZoneRaw = (providerRow as { timezone?: string | null } | null)?.timezone ?? null;
      const rawNotice = (onlineSettings as { min_notice_minutes?: number | null } | null)?.min_notice_minutes;
      const rawAdvance = (onlineSettings as { max_advance_days?: number | null } | null)?.max_advance_days;
      if (typeof rawNotice === "number" && Number.isFinite(rawNotice) && rawNotice >= 0) {
        providerMinNotice = Math.floor(rawNotice);
      }
      if (typeof rawAdvance === "number" && Number.isFinite(rawAdvance) && rawAdvance >= 1) {
        providerMaxAdvance = Math.floor(rawAdvance);
      }
      // `normalizeProviderTimezone` maps common offset forms (e.g. "GMT+2" →
      // "Etc/GMT-2"). If the provider has no usable timezone, use the same SA
      // marketplace default as `combineDateAndTime`; otherwise `public_slots`
      // would be generated in Africa/Johannesburg while legacy `slots[].time`
      // labels were recovered as raw UTC, creating the visible +2h/-2h drift.
      const normalizedProviderTimeZone = normalizeProviderTimezone(providerTimeZoneRaw);
      providerTimeZone = normalizedProviderTimeZone ?? DEFAULT_BOOKING_DISPLAY_TIMEZONE;
      if (providerTimeZoneRaw && !normalizedProviderTimeZone) {
        console.warn(
          `[availability] provider ${providerIdForEngine} has invalid timezone ` +
            `"${providerTimeZoneRaw}"; falling back to ${DEFAULT_BOOKING_DISPLAY_TIMEZONE}. ` +
            `Update providers.timezone to an IANA identifier (e.g. Africa/Johannesburg).`
        );
      }
    } catch {
      providerTimeZone = DEFAULT_BOOKING_DISPLAY_TIMEZONE;
    }

    // Min-notice + max-advance parity with the slug route: provider policy
    // is enforced server-side even if a client omits or tampers with params.
    const clientMinNotice = parseInt(
      searchParams.get("min_notice_minutes") || searchParams.get("minNoticeMinutes") || "0",
      10
    );
    const clientMaxAdvance = parseInt(
      searchParams.get("max_advance_days") || searchParams.get("maxAdvanceDays") || "365",
      10
    );
    const safeClientMinNotice =
      Number.isFinite(clientMinNotice) && clientMinNotice > 0 ? clientMinNotice : 0;
    const safeClientMaxAdvance =
      Number.isFinite(clientMaxAdvance) && clientMaxAdvance >= 1 ? clientMaxAdvance : 365;
    const effectiveMinNotice =
      providerMinNotice != null ? Math.max(safeClientMinNotice, providerMinNotice) : safeClientMinNotice;
    const effectiveMaxAdvance =
      providerMaxAdvance != null ? Math.min(safeClientMaxAdvance, providerMaxAdvance) : safeClientMaxAdvance;

    // Max-advance guard (mirrors slug route).
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const dateObj = match
      ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : NaN;
    const daysFromToday = Math.floor(
      (dateObj - today) / (24 * 60 * 60 * 1000)
    );
    if (Number.isFinite(daysFromToday) && daysFromToday > effectiveMaxAdvance) {
      return successResponse({ date, slots: [] });
    }

    let publicSlots = await computePublicSlugAvailabilitySlots({
      supabase,
      providerId: providerIdForEngine,
      date,
      totalBlockedMinutes: Number.isFinite(duration) && duration > 0 ? duration : 60,
      travelBufferMinutes:
        mode === "mobile" && Number.isFinite(travelBuffer) && travelBuffer >= 0
          ? Math.min(360, travelBuffer)
          : 0,
      locationId: locationId ?? null,
      staffIdParam: wantsAnyStaff ? "any" : staffIdTrim,
      activeStaffRows,
      excludeHoldId,
      excludeBookingId,
      providerTimeZone,
    });

    // §Release-audit 2026-04: min-notice parity. Previously only the slug
    // route applied this filter, so `/api/availability` surfaced slots that
    // the hold route immediately rejected — visible as the "booking slot
    // taken" error when a customer picked the first time of the day.
    if (effectiveMinNotice > 0) {
      const cutoff = new Date(Date.now() + effectiveMinNotice * 60 * 1000);
      publicSlots = publicSlots.filter((s) => new Date(s.start) >= cutoff);
    }

    // §Release-audit 2026-04: resource filtering parity. When the caller
    // passed service_ids / service_id we run the same resource-availability
    // filter as the slug route so required-resource slots are marked/dropped
    // consistently.
    const serviceIdParam = searchParams.get("service_id")?.trim() || null;
    const serviceIdsParam = searchParams.get("service_ids");
    const orderedOfferingIds =
      serviceIdsParam
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const resourceCheckOfferingIds =
      orderedOfferingIds.length > 0
        ? orderedOfferingIds
        : serviceIdParam
          ? [serviceIdParam]
          : [];

    if (resourceCheckOfferingIds.length > 0 && publicSlots.length > 0) {
      const admin = getSupabaseAdmin();
      const { data: ownedOfferings } = await admin
        .from("offerings")
        .select("id")
        .eq("provider_id", providerIdForEngine)
        .in("id", resourceCheckOfferingIds);
      const validOfferingIds = (ownedOfferings || []).map((o: { id: string }) => o.id);
      if (validOfferingIds.length > 0) {
        const { data: offeringRes } = await admin
          .from("offering_resources")
          .select("resource_id")
          .in("offering_id", validOfferingIds)
          .eq("required", true);
        const resourceIds = [
          ...new Set((offeringRes || []).map((r: { resource_id: string }) => r.resource_id)),
        ];
        if (resourceIds.length > 0) {
          const { checkResourceAvailability } = await import("@/lib/resources/assignment");
          const filtered = [] as typeof publicSlots;
          for (const slot of publicSlots) {
            const startAt = new Date(slot.start);
            const endAt = new Date(slot.end);
            const check = await checkResourceAvailability(admin, resourceIds, startAt, endAt);
            if (check.available) {
              filtered.push(slot);
            } else {
              filtered.push({ ...slot, is_available: false });
            }
          }
          publicSlots = filtered;
        }
      }
    }

    const slots: TimeSlot[] = availabilitySlotsAsTimeSlots(publicSlots, providerTimeZone);

    const response: Record<string, unknown> = {
      date,
      slots,
      // §Release-audit 2026-04: surface the full public slot shape so the web
      // booking flow can carry ISO start/end through state instead of
      // re-deriving an instant from the HH:MM label (which historically
      // double-translated the timezone).
      public_slots: publicSlots,
      provider_timezone: providerTimeZone,
    };

    if (authenticatedProviderId) {
      response.provider_context = {
        provider_id: authenticatedProviderId,
        is_own_staff: true,
        slot_count: slots.length,
      };
    }

    return successResponse(response);
  } catch (error) {
    console.error("Error calculating availability:", error);
    return handleApiError(error, "Failed to fetch availability");
  }
}
