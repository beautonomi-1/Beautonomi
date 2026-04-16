"use client";

import React, { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, isToday } from "date-fns";
import type { Appointment, TeamMember, TimeBlock, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import { GestureLayer } from "./GestureLayer";
import { BookingBlock } from "./BookingBlock";
import { TimeBlockElement } from "./TimeBlockElement";
import { toDateStr, timeToMinutes, resolveDayHours, type CalendarBlock } from "./utils";

interface DateColumnProps {
  date: Date;
  appointments: Appointment[];
  timeBlocks: TimeBlock[];
  availabilityBlocks: AvailabilityBlockDisplay[];
  teamMembers: TeamMember[];
  timeSlots: string[];
  startHour: number;
  useMangomintMode: boolean;
  colorBy: "status" | "service" | "team_member";
  showCanceled: boolean;
  showPrices: boolean;
  highContrast: boolean;
  workStart: number;
  workEnd: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  onAppointmentClick: (apt: Appointment) => void;
  onTimeSlotClick: (date: Date, time: string, staffId: string) => void;
  onTimeBlockClick?: (block: TimeBlock) => void;
  formatPrice?: (amount: number) => string;
}

function DateColumnComponent({
  date,
  appointments,
  timeBlocks,
  availabilityBlocks,
  teamMembers,
  timeSlots,
  startHour,
  useMangomintMode,
  colorBy,
  showCanceled,
  showPrices,
  highContrast,
  workStart,
  workEnd,
  locationOperatingHours,
  onAppointmentClick,
  onTimeSlotClick,
  onTimeBlockClick,
  formatPrice,
}: DateColumnProps) {
  const dateStr = format(date, "yyyy-MM-dd");
  // In week/3-day view each column is a date, not a staff member.
  // Use a sentinel so the DnD layer can detect "date column" drops
  // and preserve the booking's original staff rather than reassigning.
  const staffId = teamMembers.length === 1 ? teamMembers[0].id : "__date_column__";

  // Merge all team members' working hours for this day so the GestureLayer
  // can tell whether ANY staff member is available — prevents marking a
  // weekend day as "Closed" when at least one staff member has a shift.
  // When no staff has explicit working hours, return undefined so GestureLayer
  // falls back to location hours (staff without hours follow location schedule).
  const mergedStaffHours = useMemo(() => {
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const anyStaffHasHours = teamMembers.some(m => m.working_hours && Object.keys(m.working_hours).length > 0);
    if (!anyStaffHasHours) return undefined;

    const merged: Record<string, { open: string; close: string; closed?: boolean }> = {};
    for (const dayName of DAY_NAMES) {
      let earliestMin = Infinity;
      let latestMin = -1;
      let anyOpen = false;
      for (const m of teamMembers) {
        if (!m.working_hours || Object.keys(m.working_hours).length === 0) {
          // Staff without explicit hours follows location schedule — treat as open all day
          // so they don't cause the merged hours to be closed
          anyOpen = true;
          earliestMin = Math.min(earliestMin, 0);
          latestMin = Math.max(latestMin, 24 * 60);
          continue;
        }
        const resolved = resolveDayHours(m.working_hours[dayName]);
        if (!resolved || resolved.closed) continue;
        anyOpen = true;
        const openMin = timeToMinutes(resolved.open);
        const closeMin = timeToMinutes(resolved.close);
        if (openMin < earliestMin) earliestMin = openMin;
        if (closeMin > latestMin) latestMin = closeMin;
      }
      if (anyOpen && earliestMin < Infinity && latestMin > -1) {
        const padH = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        merged[dayName] = { open: padH(earliestMin), close: padH(latestMin) };
      } else {
        merged[dayName] = { open: "00:00", close: "00:00", closed: true };
      }
    }
    return Object.values(merged).some(v => !v.closed) ? merged : undefined;
  }, [teamMembers]);

  const dateAppointments = useMemo(
    () => appointments.filter((a) => toDateStr(a.scheduled_date || "") === dateStr),
    [appointments, dateStr],
  );

  const dateBlocks = useMemo<CalendarBlock[]>(() => {
    const tb = timeBlocks.filter((b) => b.date === dateStr).map((t) => ({ ...t, _source: "time_block" as const }));
    const ab = availabilityBlocks
      .filter((b) => b.date === dateStr)
      .map((a) => ({
        ...a,
        name:
          a._source === "staff_unavailability"
            ? (a.reason?.trim() || "Time off")
            : (a.reason || a.block_type),
      }));
    return [...tb, ...ab];
  }, [timeBlocks, availabilityBlocks, dateStr]);

  const visibleAppointments = useMemo(() => {
    if (useMangomintMode && !showCanceled) {
      return dateAppointments.filter((a) => a.status !== "cancelled");
    }
    return dateAppointments;
  }, [dateAppointments, useMangomintMode, showCanceled]);

  return (
    <div
      className={cn(
        "flex-1 min-w-[90px] max-w-[200px] border-r border-gray-200 last:border-r-0 relative",
        isToday(date) && "bg-primary/3",
      )}
    >
      <GestureLayer
        timeSlots={timeSlots}
        date={date}
        dateStr={dateStr}
        staffId={staffId}
        useMangomintMode={useMangomintMode}
        highContrast={highContrast}
        workStart={workStart}
        workEnd={workEnd}
        locationOperatingHours={locationOperatingHours}
        staffWorkingHours={mergedStaffHours}
        onTimeSlotClick={onTimeSlotClick}
      />

      {dateBlocks.map((block) => (
        <TimeBlockElement
          key={`block-${block.id}`}
          block={block}
          startHour={startHour}
          useMangomintMode={useMangomintMode}
          onTimeBlockClick={onTimeBlockClick}
          variant="week"
        />
      ))}

      {visibleAppointments.map((apt) => (
        <BookingBlock
          key={apt.id}
          appointment={apt}
          startHour={startHour}
          useMangomintMode={useMangomintMode}
          colorBy={colorBy}
          showCanceled={showCanceled}
          showPrices={showPrices}
          onClick={onAppointmentClick}
          variant="week"
          formatPrice={formatPrice}
        />
      ))}
    </div>
  );
}

export const DateColumn = memo(DateColumnComponent, (prev, next) => {
  if (prev.date.getTime() !== next.date.getTime()) return false;
  if (prev.startHour !== next.startHour) return false;
  if (prev.useMangomintMode !== next.useMangomintMode) return false;
  if (prev.colorBy !== next.colorBy) return false;
  if (prev.showCanceled !== next.showCanceled) return false;
  if (prev.showPrices !== next.showPrices) return false;
  if (prev.highContrast !== next.highContrast) return false;
  if (prev.workStart !== next.workStart) return false;
  if (prev.workEnd !== next.workEnd) return false;
  if (prev.timeSlots.length !== next.timeSlots.length) return false;

  if (prev.appointments.length !== next.appointments.length) return false;
  if (prev.timeBlocks.length !== next.timeBlocks.length) return false;
  if (prev.availabilityBlocks.length !== next.availabilityBlocks.length) return false;

  if (prev.onAppointmentClick !== next.onAppointmentClick) return false;
  if (prev.onTimeSlotClick !== next.onTimeSlotClick) return false;
  if (prev.locationOperatingHours !== next.locationOperatingHours) return false;
  if (prev.teamMembers !== next.teamMembers) return false;

  return true;
});

DateColumn.displayName = "DateColumn";
