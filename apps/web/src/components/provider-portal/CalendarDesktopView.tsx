"use client";

import React, { memo } from "react";
import type { Appointment, TeamMember, TimeBlock, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import { CalendarGrid } from "./calendar";

interface CalendarDesktopViewProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  timeBlocks?: TimeBlock[];
  availabilityBlocks?: AvailabilityBlockDisplay[];
  selectedDate: Date;
  view: "day" | "3-days" | "week";
  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (date: Date, time: string, teamMemberId: string) => void;
  onTimeBlockClick?: (timeBlock: TimeBlock) => void;
  onStaffFilterChange?: (staffIds: string[]) => void;
  onCheckout?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: Appointment["status"]) => void;
  onRefresh?: () => void;
  startHour?: number;
  endHour?: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  onViewWeekSchedule?: (staffMember: TeamMember) => void;
  onPrintDaySchedule?: (staffMember: TeamMember) => void;
  onEditWorkHours?: (staffMember: TeamMember) => void;
  onSetDayOff?: (staffMember: TeamMember) => void;
  businessTimezone?: string;
}

/**
 * Backward-compatible wrapper around CalendarGrid.
 * All layout, memoization, and gesture handling lives in the composable
 * sub-components under `./calendar/`.
 */
function CalendarDesktopViewComponent(props: CalendarDesktopViewProps) {
  return <CalendarGrid {...props} />;
}

function overlaySignature(blocks: AvailabilityBlockDisplay[] | undefined): string {
  return (blocks ?? [])
    .map((b) => `${b.id}-${b.date}-${b.start_time}-${b.end_time}-${b.team_member_id ?? ""}`)
    .join("|");
}

export const CalendarDesktopView = memo(CalendarDesktopViewComponent, (prev, next) => {
  if (
    prev.appointments.length !== next.appointments.length ||
    prev.teamMembers.length !== next.teamMembers.length ||
    prev.timeBlocks?.length !== next.timeBlocks?.length ||
    prev.availabilityBlocks?.length !== next.availabilityBlocks?.length ||
    overlaySignature(prev.availabilityBlocks) !== overlaySignature(next.availabilityBlocks) ||
    prev.selectedDate.getTime() !== next.selectedDate.getTime() ||
    prev.view !== next.view ||
    prev.startHour !== next.startHour ||
    prev.endHour !== next.endHour
  ) {
    return false;
  }
  const prevTb = (prev.timeBlocks ?? []).map((t) => `${t.id}-${t.date}-${t.start_time}`).join(",");
  const nextTb = (next.timeBlocks ?? []).map((t) => `${t.id}-${t.date}-${t.start_time}`).join(",");
  if (prevTb !== nextTb) return false;
  const prevIds = prev.appointments.map(a => `${a.id}-${a.scheduled_date}-${a.scheduled_time}`).join(",");
  const nextIds = next.appointments.map(a => `${a.id}-${a.scheduled_date}-${a.scheduled_time}`).join(",");
  return prevIds === nextIds;
});

CalendarDesktopView.displayName = "CalendarDesktopView";
