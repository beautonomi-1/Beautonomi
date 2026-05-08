/**
 * Assembles all overlay layers for a given day and renders CalendarOverlayTimeBlock items.
 * Currently acts as a thin coordinator — actual overlay rendering remains in CalendarDayGridColumn
 * until the grid is fully extracted from calendar.tsx in a future PR.
 */

import type { AvailabilitySegment, CalendarOverlayTimeBlockLike } from "@/features/calendar/utils/overlays";
import { availabilitySegmentToTimeBlock } from "@/features/calendar/utils/overlays";

export interface CalendarOverlayLayerOptions {
  dayKey: string;
  staffFilter: string;
  locationFilter: string;
  availabilitySegments: AvailabilitySegment[];
  staffUnavailSegments: AvailabilitySegment[];
  bookingHoldSegments: AvailabilitySegment[];
  expandedApiTimeBlocks: CalendarOverlayTimeBlockLike[];
  showBookingHolds: boolean;
}

export function assembleOverlaysForDay({
  dayKey,
  staffFilter,
  locationFilter,
  availabilitySegments,
  staffUnavailSegments,
  bookingHoldSegments,
  expandedApiTimeBlocks,
  showBookingHolds,
}: CalendarOverlayLayerOptions): CalendarOverlayTimeBlockLike[] {
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
    if (seg.date !== dayKey) continue;
    if (!matchStaff(seg.team_member_id)) continue;
    if (!matchLocation(seg.location_id)) continue;
    out.push(availabilitySegmentToTimeBlock({ ...seg, _source: "staff_unavailability" }));
  }

  for (const seg of availabilitySegments) {
    if (seg.date !== dayKey) continue;
    if (!matchStaff(seg.team_member_id)) continue;
    if (!matchLocation(seg.location_id)) continue;
    out.push(availabilitySegmentToTimeBlock(seg));
  }

  if (showBookingHolds) {
    for (const seg of bookingHoldSegments) {
      if (seg.date !== dayKey) continue;
      if (!matchStaff(seg.team_member_id)) continue;
      if (!matchLocation(seg.location_id)) continue;
      out.push(availabilitySegmentToTimeBlock(seg));
    }
  }

  for (const tb of expandedApiTimeBlocks) {
    if (tb.date !== dayKey) continue;
    if (!matchStaff(tb.staff_id)) continue;
    if (!matchLocation((tb as CalendarOverlayTimeBlockLike & { location_id?: string | null }).location_id)) continue;
    out.push(tb);
  }

  return out;
}
