"use client";

import React, { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Appointment, TeamMember, TimeBlock } from "@/lib/provider-portal/types";
import { mergeTeamWorkingHoursForCalendar } from "./utils";
import { GestureLayer } from "./GestureLayer";
import { BookingBlock } from "./BookingBlock";
import { TimeBlockElement } from "./TimeBlockElement";
import type { CalendarBlock } from "./utils";
import { STAFF_DAY_COLUMN_LAYOUT } from "./constants";

interface StaffColumnProps {
  member: TeamMember;
  /** Full team — used when `member` has no personal working hours (week view parity). */
  teamMembers: TeamMember[];
  date: Date;
  appointments: Appointment[];
  blocks: CalendarBlock[];
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

function StaffColumnComponent({
  member,
  teamMembers,
  date,
  appointments,
  blocks,
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
}: StaffColumnProps) {
  const dateStr = format(date, "yyyy-MM-dd");

  const staffWorkingHoursEffective = useMemo(() => {
    if (member.working_hours && Object.keys(member.working_hours).length > 0) {
      return member.working_hours;
    }
    return mergeTeamWorkingHoursForCalendar(teamMembers);
  }, [member.working_hours, teamMembers]);

  const visibleAppointments = useMemo(() => {
    if (useMangomintMode && !showCanceled) {
      return appointments.filter((a) => a.status !== "cancelled");
    }
    return appointments;
  }, [appointments, useMangomintMode, showCanceled]);

  return (
    <div
      className={cn(
        "border-r border-gray-200 last:border-r-0 relative transition-all",
        STAFF_DAY_COLUMN_LAYOUT,
      )}
    >
      <GestureLayer
        timeSlots={timeSlots}
        date={date}
        dateStr={dateStr}
        staffId={member.id}
        useMangomintMode={useMangomintMode}
        highContrast={highContrast}
        workStart={workStart}
        workEnd={workEnd}
        locationOperatingHours={locationOperatingHours}
        staffWorkingHours={staffWorkingHoursEffective}
        onTimeSlotClick={onTimeSlotClick}
      />

      {blocks.map((block) => (
        <TimeBlockElement
          key={`block-${block.id}`}
          block={block}
          startHour={startHour}
          useMangomintMode={useMangomintMode}
          onTimeBlockClick={onTimeBlockClick}
          variant="day"
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
          variant="day"
          formatPrice={formatPrice}
        />
      ))}
    </div>
  );
}

export const StaffColumn = memo(StaffColumnComponent, (prev, next) => {
  if (prev.member.id !== next.member.id) return false;
  if (prev.teamMembers !== next.teamMembers) return false;
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
  if (prev.blocks.length !== next.blocks.length) return false;
  const prevBlockSig = prev.blocks.map((b) => `${b.id}-${b.start_time}-${b.end_time}`).join(",");
  const nextBlockSig = next.blocks.map((b) => `${b.id}-${b.start_time}-${b.end_time}`).join(",");
  if (prevBlockSig !== nextBlockSig) return false;

  if (prev.appointments.length !== next.appointments.length) return false;
  for (let i = 0; i < prev.appointments.length; i++) {
    const a = prev.appointments[i];
    const b = next.appointments[i];
    if (
      a.id !== b.id ||
      a.status !== b.status ||
      a.scheduled_time !== b.scheduled_time ||
      a.duration_minutes !== b.duration_minutes
    )
      return false;
  }

  if (prev.onAppointmentClick !== next.onAppointmentClick) return false;
  if (prev.onTimeSlotClick !== next.onTimeSlotClick) return false;
  if (prev.locationOperatingHours !== next.locationOperatingHours) return false;
  if (prev.member.working_hours !== next.member.working_hours) return false;

  return true;
});

StaffColumn.displayName = "StaffColumn";
