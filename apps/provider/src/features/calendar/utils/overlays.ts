import { wallClockInTimeZone } from "@beautonomi/utils";
import {
  normalizeCalendarWallClockLoose as normalizeCalendarTime,
} from "@/lib/provider-calendar-parity";
import type { CalendarOverlayKind } from "@/features/calendar/types/overlay";

export interface AvailabilityBlockApi {
  id: string;
  block_type: "unavailable" | "break" | "maintenance";
  start_at: string;
  end_at: string;
  staff_id: string | null;
  location_id: string | null;
  reason?: string | null;
}

export interface AvailabilitySegment {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  team_member_id: string | null;
  location_id: string | null;
  block_type: "unavailable" | "break" | "maintenance";
  reason?: string | null;
  _source?: "staff_unavailability" | "availability_block";
  parent_block_id?: string;
}

export interface CalendarOverlayTimeBlockLike {
  id: string;
  staff_id: string | null;
  block_type: string;
  title: string;
  start_time: string;
  end_time: string;
  date: string;
  overlay_source?: "staff_unavailability" | "availability_block";
  availability_block_id?: string;
  calendar_overlay_kind?: CalendarOverlayKind;
  hold_id?: string;
  hold_expires_at?: string | null;
}

/**
 * Split multi-day availability blocks into per-day segments (provider TZ).
 */
export function normalizeAvailabilityBlocksToSegments(
  raw: AvailabilityBlockApi[],
  tz?: string | null,
): AvailabilitySegment[] {
  const safeTz = tz || "UTC";
  const result: AvailabilitySegment[] = [];
  const pad = (n: number) => n.toString().padStart(2, "0");
  for (const block of raw) {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    let cursor = new Date(start.getTime());
    while (cursor < end) {
      const wc = wallClockInTimeZone(cursor, safeTz);
      const dateStr = `${String(wc.year).padStart(4, "0")}-${pad(wc.month)}-${pad(wc.day)}`;

      const tryNext = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      const tryWc = wallClockInTimeZone(tryNext, safeTz);
      let boundary = tryNext;
      if (tryWc.day === wc.day && tryWc.month === wc.month && tryWc.year === wc.year) {
        boundary = new Date(cursor.getTime() + 25 * 60 * 60 * 1000);
      }
      const segmentEnd = end < boundary ? end : boundary;
      const startWc = wallClockInTimeZone(cursor, safeTz);
      const endWc = wallClockInTimeZone(segmentEnd < end ? segmentEnd : end, safeTz);
      const startTime = `${pad(startWc.hour)}:${pad(startWc.minute)}`;
      const endTime =
        segmentEnd >= end ? `${pad(endWc.hour)}:${pad(endWc.minute)}` : "00:00";

      result.push({
        id: `${block.id}-${dateStr}-${startTime}`,
        parent_block_id: block.id,
        date: dateStr,
        start_time: startTime,
        end_time: endTime,
        team_member_id: block.staff_id,
        location_id: block.location_id ?? null,
        block_type: block.block_type,
        reason: block.reason,
        _source: "availability_block",
      });
      cursor = boundary;
    }
  }
  return result;
}

export interface CalendarBlocksForDayOptions {
  day: Date;
  providerTimezone?: string | null;
  staffFilter?: string;
  locationFilter?: string;
  showBookingHolds?: boolean;
  availabilitySegments: AvailabilitySegment[];
  staffUnavailSegments: AvailabilitySegment[];
  bookingHoldSegments: AvailabilitySegment[];
  expandedApiTimeBlocks: CalendarOverlayTimeBlockLike[];
}

/**
 * Pure function version of the legacy `getCalendarBlocksForDay` closure.
 * Returns all overlay time blocks for a specific day, filtered by staff/location.
 */
export function getCalendarBlocksForDay(opts: CalendarBlocksForDayOptions): CalendarOverlayTimeBlockLike[] {
  const {
    day,
    providerTimezone,
    staffFilter = "all",
    locationFilter = "all",
    showBookingHolds = false,
    availabilitySegments,
    staffUnavailSegments,
    bookingHoldSegments,
    expandedApiTimeBlocks,
  } = opts;

  const { wallClockInTimeZone } = require("@beautonomi/utils");
  const wc = wallClockInTimeZone(day, providerTimezone ?? "UTC");
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dayStr = `${String(wc.year).padStart(4, "0")}-${pad(wc.month)}-${pad(wc.day)}`;

  const matchStaff = (staffId: string | null) => {
    if (staffFilter === "all") return true;
    return staffId == null || staffId === staffFilter;
  };
  const matchLocation = (locationId: string | null | undefined) => {
    if (locationFilter === "all") return true;
    return locationId == null || locationId === locationFilter;
  };

  const out: CalendarOverlayTimeBlockLike[] = [];

  for (const seg of staffUnavailSegments) {
    if (seg.date !== dayStr) continue;
    if (!matchStaff(seg.team_member_id)) continue;
    if (!matchLocation(seg.location_id)) continue;
    out.push(availabilitySegmentToTimeBlock({ ...seg, _source: "staff_unavailability" }));
  }
  for (const seg of availabilitySegments) {
    if (seg.date !== dayStr) continue;
    if (!matchStaff(seg.team_member_id)) continue;
    if (!matchLocation(seg.location_id)) continue;
    out.push(availabilitySegmentToTimeBlock(seg));
  }
  if (showBookingHolds) {
    for (const seg of bookingHoldSegments) {
      if (seg.date !== dayStr) continue;
      if (!matchStaff(seg.team_member_id)) continue;
      if (!matchLocation(seg.location_id)) continue;
      out.push(availabilitySegmentToTimeBlock(seg));
    }
  }
  for (const tb of expandedApiTimeBlocks) {
    if (tb.date !== dayStr) continue;
    if (!matchStaff(tb.staff_id)) continue;
    out.push(tb);
  }
  return out;
}

export function availabilitySegmentToTimeBlock(seg: AvailabilitySegment): CalendarOverlayTimeBlockLike {
  const isStaff = seg._source === "staff_unavailability";
  const startNorm = normalizeCalendarTime(seg.start_time) ?? seg.start_time;
  const endNorm = normalizeCalendarTime(seg.end_time) ?? seg.end_time;
  return {
    id: seg.id,
    staff_id: seg.team_member_id,
    block_type: seg.block_type,
    title: (seg.reason && seg.reason.trim()) || seg.block_type,
    start_time: startNorm,
    end_time: endNorm,
    date: seg.date,
    overlay_source: seg._source,
    availability_block_id: isStaff ? undefined : seg.parent_block_id,
    calendar_overlay_kind: isStaff ? "staff_off" : "availability",
  };
}
