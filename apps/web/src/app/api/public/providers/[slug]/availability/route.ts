import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import type { AvailabilitySlot } from "@/types/beautonomi";
import {
  publicSlugSpanParamsFromSlices,
  type OfferingTimingSlice,
} from "@/lib/booking-slot-math/blocked-window-minutes";
import { computePublicSlugAvailabilitySlots } from "@/lib/availability/public-slug-availability-engine";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";

/**
 * GET /api/public/providers/[slug]/availability
 *
 * Get available time slots for the public book flow (express/online booking).
 * Accepts duration_minutes and buffer_minutes so multi-service and group
 * bookings can pass total span. Optional `service_ids` (comma-separated UUIDs)
 * unions required resources across offerings for multi-service carts; when omitted,
 * `service_id` alone is used for resource rules.
 * Uses the same engine as portal and `/api/availability`:
 * `loadAvailabilityConstraints` + `calculateAvailableSlots` (see /api/portal/availability).
 * Optional `travel_buffer_minutes` (at-home) is passed through like `/api/availability`.
 *
 * When `service_ids` (comma-separated offering UUIDs) is present, **duration_minutes** and
 * **buffer_minutes** are recomputed server-side from `offerings` in query order using
 * {@link publicSlugSpanParamsFromSlices} so the blocked window matches `validateBooking` /
 * `sumChainedBlockedMinutes` (client params are ignored for that split when all ids resolve).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) return tenantRes;
    const { tenantId } = tenantRes;

    const supabase = getSupabaseAdmin();
    const rawSlug = (await params).slug;
    let slug: string;
    try { slug = decodeURIComponent(rawSlug); } catch { slug = rawSlug; }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const { searchParams } = new URL(request.url);

    const date = searchParams.get("date");
    const serviceId = searchParams.get("service_id");
    const staffId = searchParams.get("staff_id");
    const locationId = searchParams.get("location_id");
    const paramDuration = searchParams.get("duration_minutes");
    const paramBuffer = searchParams.get("buffer_minutes");
    const addonDurationParam = parseInt(searchParams.get("addon_duration_minutes") || "0", 10);
    const minNoticeMinutes = parseInt(searchParams.get("min_notice_minutes") || "0");
    const maxAdvanceDays = parseInt(searchParams.get("max_advance_days") || "365");
    const excludeHoldId = searchParams.get("excludeHoldId")?.trim() || undefined;
    const excludeBookingId = searchParams.get("exclude_booking_id")?.trim() || undefined;

    if (!date) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Date parameter is required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const clientMinNotice = Number.isNaN(minNoticeMinutes) || minNoticeMinutes < 0 ? 0 : minNoticeMinutes;
    const clientMaxAdvance = Number.isNaN(maxAdvanceDays) || maxAdvanceDays < 1 ? 365 : maxAdvanceDays;

    // Use admin client to bypass RLS — consistent with the SSR profile loader
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, timezone")
      .eq("tenant_id", tenantId)
      .eq(isUuid ? "id" : "slug", slug)
      .maybeSingle();

    if (providerError || !provider) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // §Release-audit 2026-04: the public slot grid previously trusted
    // `min_notice_minutes` / `max_advance_days` purely from the client
    // query params (defaulting to 0 / 365). Providers configure a real
    // policy in `provider_online_booking_settings` and expect the booking
    // flow to honour it — a buggy / compromised customer client could
    // otherwise request "slots today" with `min_notice_minutes=0` and
    // book 5 minutes before a service starts. Enforce the provider's
    // values as floor / ceiling so parity with the provider portal holds
    // (the portal intentionally bypasses these because providers manage
    // their own exceptions; public customers cannot).
    let providerMinNotice: number | null = null;
    let providerMaxAdvance: number | null = null;
    try {
      const { data: onlineSettings } = await supabase
        .from("provider_online_booking_settings")
        .select("min_notice_minutes, max_advance_days")
        .eq("provider_id", provider.id)
        .maybeSingle();
      if (onlineSettings) {
        const rawNotice = (onlineSettings as { min_notice_minutes?: number | null }).min_notice_minutes;
        const rawAdvance = (onlineSettings as { max_advance_days?: number | null }).max_advance_days;
        if (typeof rawNotice === "number" && Number.isFinite(rawNotice) && rawNotice >= 0) {
          providerMinNotice = Math.floor(rawNotice);
        }
        if (typeof rawAdvance === "number" && Number.isFinite(rawAdvance) && rawAdvance >= 1) {
          providerMaxAdvance = Math.floor(rawAdvance);
        }
      }
    } catch (err) {
      console.warn(
        "[public-availability] provider_online_booking_settings lookup failed; falling back to client params",
        err,
      );
    }

    const effectiveMinNotice =
      providerMinNotice != null ? Math.max(clientMinNotice, providerMinNotice) : clientMinNotice;
    const effectiveMaxAdvance =
      providerMaxAdvance != null ? Math.min(clientMaxAdvance, providerMaxAdvance) : clientMaxAdvance;

    // Duration and buffer: prefer authoritative chain from `service_ids` + DB; else query params; else single offering.
    let durationMinutes = paramDuration != null ? parseInt(paramDuration, 10) : NaN;
    let bufferMinutes = paramBuffer != null ? parseInt(paramBuffer, 10) : NaN;

    const serviceIdsParam = searchParams.get("service_ids");
    const orderedOfferingIds =
      serviceIdsParam
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

    if (orderedOfferingIds.length > 0) {
      const { data: offRows, error: offErr } = await supabase
        .from("offerings")
        .select("id, duration_minutes, buffer_minutes, is_active")
        .eq("provider_id", provider.id)
        .eq("is_active", true)
        .in("id", orderedOfferingIds);

      if (!offErr && offRows?.length) {
        const byId = new Map(offRows.map((o) => [o.id, o]));
        const slices: OfferingTimingSlice[] = [];
        let allResolved = true;
        for (const oid of orderedOfferingIds) {
          const o = byId.get(oid);
          if (!o) {
            allResolved = false;
            break;
          }
          slices.push({
            durationMinutes: Number(o.duration_minutes) || 60,
            bufferAfterMinutes: Math.max(0, Number(o.buffer_minutes) || 0),
          });
        }
        if (allResolved && slices.length === orderedOfferingIds.length) {
          const span = publicSlugSpanParamsFromSlices(slices);
          durationMinutes = span.durationMinutes;
          bufferMinutes = span.bufferMinutes;
        }
      }
    }

    if (serviceId) {
      const { data: offering, error: offeringError } = await supabase
        .from("offerings")
        .select("id, provider_id, duration_minutes, buffer_minutes, is_active")
        .eq("id", serviceId)
        .single();
      if (!offeringError && offering && offering.provider_id === provider.id && offering.is_active) {
        if (Number.isNaN(durationMinutes) || durationMinutes <= 0)
          durationMinutes = Number(offering.duration_minutes) || 60;
        // Always use the authoritative DB buffer when a service_id is resolved so the
        // listing engine and validate-booking agree on the effective segment end.
        // Client-supplied buffer_minutes is only trusted when no offering can be resolved
        // (e.g. custom multi-service params without a leading service_id).
        bufferMinutes = Number(offering.buffer_minutes) || 0;
      }
    }
    if (Number.isNaN(durationMinutes) || durationMinutes <= 0) durationMinutes = 60;
    if (Number.isNaN(bufferMinutes) || bufferMinutes < 0) bufferMinutes = 0;
    const addonDurationMinutes =
      Number.isFinite(addonDurationParam) && addonDurationParam > 0
        ? Math.min(24 * 60, addonDurationParam)
        : 0;
    durationMinutes += addonDurationMinutes;

    const anyoneMode =
      staffId === "any" ||
      staffId === "" ||
      (typeof staffId === "string" && staffId.startsWith("provider-"));

    let staffList: Array<{ id: string }> = [];
    if (anyoneMode) {
      const { data: allStaff, error: staffListError } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("provider_id", provider.id)
        .eq("is_active", true);
      if (!staffListError && allStaff) {
        staffList = allStaff
          .map((s) => ({ id: s.id }))
          .sort((a, b) => a.id.localeCompare(b.id));
      }
    }

    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const requestedDate = dateMatch
      ? Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
      : NaN;
    const daysFromToday = Math.floor((requestedDate - today) / (24 * 60 * 60 * 1000));
    if (Number.isFinite(daysFromToday) && daysFromToday > effectiveMaxAdvance) {
      return NextResponse.json({ data: { slots: [] }, error: null });
    }

    const totalBlockedMinutes = durationMinutes + bufferMinutes;
    const travelBufferParam = parseInt(searchParams.get("travel_buffer_minutes") || "0", 10);
    const travelBufferMinutes =
      Number.isFinite(travelBufferParam) && travelBufferParam >= 0 ? Math.min(360, travelBufferParam) : 0;

    // §Launch-audit 2026-04-18: providers.timezone has historically
    // accepted non-IANA values ("GMT+2", "UTC-5"). Normalise before
    // handing to the engine so Intl.DateTimeFormat never throws and
    // /api/public/providers/[slug]/availability stays in lockstep with
    // /api/availability — the two routes MUST agree on slot instants.
    const rawProviderTimeZone =
      typeof (provider as { timezone?: string | null }).timezone === "string"
        ? (provider as { timezone?: string | null }).timezone
        : null;
    const normalizedProviderTimeZone = normalizeProviderTimezone(rawProviderTimeZone);
    const providerTimeZone = normalizedProviderTimeZone ?? DEFAULT_BOOKING_DISPLAY_TIMEZONE;
    if (rawProviderTimeZone && !normalizedProviderTimeZone) {
      console.warn(
        `[public-availability] provider ${provider.id} has invalid timezone ` +
          `"${rawProviderTimeZone}"; falling back to ${DEFAULT_BOOKING_DISPLAY_TIMEZONE}.`
      );
    }

    let slots = await computePublicSlugAvailabilitySlots({
      supabase,
      providerId: provider.id,
      date,
      totalBlockedMinutes,
      travelBufferMinutes,
      locationId: locationId || null,
      staffIdParam: staffId,
      activeStaffRows: staffList,
      excludeHoldId,
      excludeBookingId,
      providerTimeZone,
    });

    // Filter by min_notice_minutes: exclude any slot that starts before now + lead time
    // (must apply on every calendar date — e.g. tomorrow 8am can be invalid if it is <12h away)
    if (effectiveMinNotice > 0) {
      const cutoff = new Date(Date.now() + effectiveMinNotice * 60 * 1000);
      slots = slots.filter((s) => new Date(s.start) >= cutoff);
    }

    // Filter by resource availability: union required resources across offerings (multi-service).
    // Include at-home travel buffer in the occupancy window so resource checks match staff conflict windows.
    const resourceCheckOfferingIds =
      orderedOfferingIds.length > 0
        ? orderedOfferingIds
        : serviceId
          ? [serviceId]
          : [];

    if (resourceCheckOfferingIds.length > 0 && slots.length > 0) {
      const { data: ownedOfferings } = await supabase
        .from("offerings")
        .select("id")
        .eq("provider_id", provider.id)
        .in("id", resourceCheckOfferingIds);
      const validOfferingIds = (ownedOfferings || []).map((o: { id: string }) => o.id);
      if (validOfferingIds.length > 0) {
        const { data: offeringRes } = await supabase
          .from("offering_resources")
          .select("resource_id")
          .in("offering_id", validOfferingIds)
          .eq("required", true);
        const resourceIds = [...new Set((offeringRes || []).map((r: { resource_id: string }) => r.resource_id))];
        if (resourceIds.length > 0) {
          const { checkResourceAvailability } = await import("@/lib/resources/assignment");
          const availableSlots: AvailabilitySlot[] = [];
          for (const slot of slots) {
            const startAt = new Date(slot.start);
            const endAt = new Date(new Date(slot.end).getTime() + travelBufferMinutes * 60000);
            const check = await checkResourceAvailability(supabase, resourceIds, startAt, endAt);
            if (check.available) {
              availableSlots.push(slot);
            } else {
              availableSlots.push({ ...slot, is_available: false });
            }
          }
          slots = availableSlots;
        }
      }
    }

    return NextResponse.json({
      data: {
        slots: slots,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/public/providers/[slug]/availability:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch availability",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
