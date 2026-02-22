import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AvailabilitySlot } from "@/types/beautonomi";

type WorkingHoursDay = {
  is_open?: boolean;
  open_time?: string; // "09:00"
  close_time?: string; // "17:00"
  breaks?: { start: string; end: string }[]; // e.g. [{ start: "12:00", end: "13:00" }]
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
function dayKeyFromDate(date: Date): (typeof DAY_KEYS)[number] {
  const d = date.getDay();
  return DAY_KEYS[d];
}

function parseTimeToMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isoAtLocalDateMinutes(dateStr: string, minutes: number): string {
  // Interprets `${dateStr}T..` in server local timezone. This matches existing behavior in the codebase.
  const hh = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mm = (minutes % 60).toString().padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00`).toISOString();
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && ae > bs;
}

/**
 * GET /api/public/providers/[slug]/availability
 * 
 * Get available time slots for a provider
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    const date = searchParams.get("date");
    const serviceId = searchParams.get("service_id");
    const staffId = searchParams.get("staff_id");
    const locationId = searchParams.get("location_id");
    let durationMinutes = parseInt(searchParams.get("duration_minutes") || "60");
    const minNoticeMinutes = parseInt(searchParams.get("min_notice_minutes") || "0");
    const maxAdvanceDays = parseInt(searchParams.get("max_advance_days") || "365");

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

    if (Number.isNaN(durationMinutes) || durationMinutes <= 0) durationMinutes = 60;
    const effectiveMinNotice = Number.isNaN(minNoticeMinutes) || minNoticeMinutes < 0 ? 0 : minNoticeMinutes;
    const effectiveMaxAdvance = Number.isNaN(maxAdvanceDays) || maxAdvanceDays < 1 ? 365 : maxAdvanceDays;

    // Get provider
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

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

    // If service_id provided, load offering duration/buffer
    let bufferMinutes = 0;
    if (serviceId) {
      const { data: offering, error: offeringError } = await supabase
        .from("offerings")
        .select("id, provider_id, duration_minutes, buffer_minutes, is_active")
        .eq("id", serviceId)
        .single();
      if (!offeringError && offering && offering.provider_id === provider.id && offering.is_active) {
        durationMinutes = Number(offering.duration_minutes) || durationMinutes;
        bufferMinutes = Number(offering.buffer_minutes) || 0;
      }
    }

    // "any" = aggregate slots across all staff (anyone available)
    const anyoneMode = staffId === "any" || staffId === "";
    const effectiveStaffId = anyoneMode ? null : staffId;

    // Determine working hours: prefer staff hours if staff_id provided, otherwise location hours (primary/selected)
    const day = dayKeyFromDate(new Date(`${date}T00:00:00`));

    let staffHours: WorkingHoursDay | null = null;
    let staffList: Array<{ id: string; working_hours: Record<string, WorkingHoursDay> | null }> = [];

    if (anyoneMode) {
      const { data: allStaff, error: staffListError } = await supabase
        .from("provider_staff")
        .select("id, working_hours")
        .eq("provider_id", provider.id)
        .eq("is_active", true);
      if (!staffListError && allStaff) {
        staffList = allStaff.map((s) => ({
          id: s.id,
          working_hours: s.working_hours as Record<string, WorkingHoursDay> | null,
        }));
      }
    } else if (effectiveStaffId) {
      const { data: staff, error: staffError } = await supabase
        .from("provider_staff")
        .select("id, provider_id, is_active, working_hours")
        .eq("id", effectiveStaffId)
        .single();
      if (!staffError && staff && staff.provider_id === provider.id && staff.is_active) {
        staffHours = (staff.working_hours || {})[day] || null;
      }
    }

    let locationHours: WorkingHoursDay | null = null;
    if (locationId) {
      const { data: loc, error: locError } = await supabase
        .from("provider_locations")
        .select("id, provider_id, is_active, working_hours")
        .eq("id", locationId)
        .single();
      if (!locError && loc && loc.provider_id === provider.id && loc.is_active) {
        locationHours = (loc.working_hours || {})[day] || null;
      }
    } else {
      const { data: locs, error: locsError } = await supabase
        .from("provider_locations")
        .select("id, provider_id, is_active, is_primary, working_hours")
        .eq("provider_id", provider.id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      if (!locsError && locs && locs.length > 0) {
        locationHours = (locs[0].working_hours || {})[day] || null;
      }
    }

    const defaultHours: WorkingHoursDay = { is_open: true, open_time: "09:00", close_time: "18:00" };

    // Fetch existing booking conflicts for the day
    const startOfDayIso = isoAtLocalDateMinutes(date, 0);
    const endOfDayIso = isoAtLocalDateMinutes(date, 24 * 60 - 1);

    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, status, provider_id, location_id")
      .eq("provider_id", provider.id)
      .gte("scheduled_at", startOfDayIso)
      .lte("scheduled_at", endOfDayIso)
      .not("status", "in", "(cancelled,no_show)");

    if (bookingsError) throw bookingsError;

    const bookingIds = (bookings || []).map((b) => b.id);
    let busyIntervals: Array<{ start: string; end: string; staff_id?: string | null }> = [];

    if (bookingIds.length > 0) {
      const { data: svcRows, error: svcError } = await supabase
        .from("booking_services")
        .select("scheduled_start_at, scheduled_end_at, staff_id, booking_id")
        .in("booking_id", bookingIds);
      if (svcError) throw svcError;
      busyIntervals = (svcRows || []).map((r) => ({
        start: r.scheduled_start_at,
        end: r.scheduled_end_at,
        staff_id: r.staff_id,
      }));
    }

    // Fetch availability blocks that overlap this day (block.end_at > startOfDay AND block.start_at < endOfDay)
    const { data: blocks, error: blocksError } = await supabase
      .from("availability_blocks")
      .select("start_at, end_at, staff_id, location_id")
      .eq("provider_id", provider.id)
      .gt("end_at", startOfDayIso)
      .lt("start_at", endOfDayIso);
    if (blocksError) throw blocksError;

    const step = 15;
    const slotDuration = durationMinutes;
    const totalSpan = slotDuration + bufferMinutes;

    const buildSlotsForStaff = (
      hours: WorkingHoursDay | null,
      sid: string | null
    ): AvailabilitySlot[] => {
      const chosen = hours || locationHours || defaultHours;
      const isOpen = chosen.is_open !== false;
      const openMin = parseTimeToMinutes(chosen.open_time || "09:00");
      const closeMin = parseTimeToMinutes(chosen.close_time || "18:00");
      if (!isOpen || openMin === null || closeMin === null || closeMin <= openMin) {
        return [];
      }
      const breakRanges: Array<{ start: number; end: number }> = [];
      for (const br of chosen.breaks ?? []) {
        const bs = parseTimeToMinutes(br.start);
        const be = parseTimeToMinutes(br.end);
        if (bs !== null && be !== null && be > bs) breakRanges.push({ start: bs, end: be });
      }
      const slotOverlapsBreak = (slotStartMin: number, slotEndMin: number) =>
        breakRanges.some((br) => slotStartMin < br.end && slotEndMin > br.start);

      const slots: AvailabilitySlot[] = [];
      for (let startMin = openMin; startMin + slotDuration <= closeMin; startMin += step) {
        const slotEndMin = startMin + slotDuration;
        if (slotOverlapsBreak(startMin, slotEndMin)) continue;
        const slotStartIso = isoAtLocalDateMinutes(date, startMin);
        const slotEndIso = isoAtLocalDateMinutes(date, slotEndMin);
        const blockEndIso = isoAtLocalDateMinutes(date, startMin + totalSpan);
        if (startMin + totalSpan > closeMin) continue;
        let available = true;
        for (const b of busyIntervals) {
          if (sid && b.staff_id && b.staff_id !== sid) continue;
          if (overlaps(slotStartIso, blockEndIso, b.start, b.end)) {
            available = false;
            break;
          }
        }
        if (available) {
          for (const blk of blocks || []) {
            if (sid && blk.staff_id && blk.staff_id !== sid) continue;
            if (locationId && blk.location_id && blk.location_id !== locationId) continue;
            if (overlaps(slotStartIso, blockEndIso, blk.start_at, blk.end_at)) {
              available = false;
              break;
            }
          }
        }
        slots.push({
          start: slotStartIso,
          end: slotEndIso,
          staff_id: sid || undefined,
          location_id: locationId || undefined,
          is_available: available,
        });
      }
      return slots;
    };

    let slots: AvailabilitySlot[];

    if (anyoneMode && staffList.length > 0) {
      const slotToStaff = new Map<string, string>();
      const allStarts = new Set<string>();
      for (const s of staffList) {
        const hours = (s.working_hours || {})[day] || null;
        const staffSlots = buildSlotsForStaff(hours, s.id);
        for (const slot of staffSlots) {
          allStarts.add(slot.start);
          if (slot.is_available && !slotToStaff.has(slot.start)) {
            slotToStaff.set(slot.start, s.id);
          }
        }
      }
      slots = Array.from(allStarts)
        .sort()
        .map((start) => {
          const end = new Date(start);
          end.setMinutes(end.getMinutes() + slotDuration);
          const availableStaffId = slotToStaff.get(start);
          return {
            start,
            end: end.toISOString(),
            staff_id: availableStaffId || undefined,
            location_id: locationId || undefined,
            is_available: !!availableStaffId,
          };
        });
    } else {
      const chosen = staffHours || locationHours || defaultHours;
      const isOpen = chosen.is_open !== false;
      const openMin = parseTimeToMinutes(chosen.open_time || "09:00");
      const closeMin = parseTimeToMinutes(chosen.close_time || "18:00");
      if (!isOpen || openMin === null || closeMin === null || closeMin <= openMin) {
        return NextResponse.json({ data: { slots: [] }, error: null });
      }
      slots = buildSlotsForStaff(staffHours || locationHours || defaultHours, effectiveStaffId);
    }

    // Filter by max_advance_days: reject dates too far in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateObj = new Date(`${date}T00:00:00`);
    dateObj.setHours(0, 0, 0, 0);
    const daysFromToday = Math.floor((dateObj.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (daysFromToday > effectiveMaxAdvance) {
      return NextResponse.json({ data: { slots: [] }, error: null });
    }

    // Filter by min_notice_minutes: exclude slots starting before now + min notice
    if (effectiveMinNotice > 0 && date === today.toISOString().split("T")[0]) {
      const cutoff = new Date(Date.now() + effectiveMinNotice * 60 * 1000);
      slots = slots.filter((s) => new Date(s.start) >= cutoff);
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
