"use client";

import React, { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { isTodayInTz, resolveTz } from "@/lib/dates/provider-tz";
import { formatDateKeyInTimeZone } from "@beautonomi/utils";
import type { Appointment, TeamMember, TimeBlock, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import { GestureLayer } from "./GestureLayer";
import { BookingBlock } from "./BookingBlock";
import { TimeBlockElement } from "./TimeBlockElement";
import { toDateStr, mergeTeamWorkingHoursForCalendar, type CalendarBlock } from "./utils";

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
  businessTimezone?: string;
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
  businessTimezone,
  onAppointmentClick,
  onTimeSlotClick,
  onTimeBlockClick,
  formatPrice,
}: DateColumnProps) {
  const tz = resolveTz(businessTimezone);
  const dateStr = formatDateKeyInTimeZone(date, tz);
  // In week/3-day view each column is a date, not a staff member.
  // Use a sentinel so the DnD layer can detect "date column" drops
  // and preserve the booking's original staff rather than reassigning.
  const staffId = teamMembers.length === 1 ? teamMembers[0].id : "__date_column__";

  // Merge all team members' working hours for this day so the GestureLayer
  // can tell whether ANY staff member is available — prevents marking a
  // weekend day as "Closed" when at least one staff member has a shift.
  // When no staff has explicit working hours, return undefined so GestureLayer
  // falls back to location hours (staff without hours follow location schedule).
  const mergedStaffHours = useMemo(
    () => mergeTeamWorkingHoursForCalendar(teamMembers),
    [teamMembers],
  );

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
        isTodayInTz(date, tz) && "bg-primary/3",
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
  if (prev.businessTimezone !== next.businessTimezone) return false;
  if (prev.teamMembers !== next.teamMembers) return false;

  return true;
});

DateColumn.displayName = "DateColumn";
