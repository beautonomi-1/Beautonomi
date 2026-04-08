/**
 * Provider Scheduler
 *
 * Wrapper around calendar grid views with the adapter layer, drag-and-drop context,
 * and viewport-gated rendering (only one of desktop / mobile mounts at a time).
 */

"use client";

import React, { useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Appointment,
  TeamMember,
  ServiceItem,
  TimeBlock,
  AvailabilityBlockDisplay,
} from "@/lib/provider-portal/types";
import { CalendarDesktopWithDnd } from "@/components/provider-portal/CalendarDesktopWithDnd";
import { CalendarMobileWithDnd } from "@/components/provider-portal/CalendarMobileWithDnd";
import { useMediaQueryMatch, TW_MD_MIN_QUERY } from "@/hooks/useMediaQueryMatch";

export interface ProviderSchedulerProps {
  appointments: Appointment[];
  teamMembers: TeamMember[];
  services?: ServiceItem[];
  timeBlocks?: TimeBlock[];

  selectedDate: Date;
  view: "day" | "3-days" | "week";
  startHour?: number;
  endHour?: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  availabilityBlocks?: AvailabilityBlockDisplay[];
  businessTimezone?: string;

  onAppointmentClick: (appointment: Appointment) => void;
  onTimeSlotClick: (date: Date, time: string, teamMemberId: string) => void;
  onTimeBlockClick?: (timeBlock: TimeBlock) => void;
  onCheckout?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: Appointment["status"]) => void;
  onRefresh?: () => void;
  onViewWeekSchedule?: (staffMember: TeamMember) => void;
  onPrintDaySchedule?: (staffMember: TeamMember) => void;
  onEditWorkHours?: (staffMember: TeamMember) => void;
  onSetDayOff?: (staffMember: TeamMember) => void;
  selectedTeamMemberId?: string | null;
  onClearStaffFilter?: () => void;

  /** When set, drag-and-drop reschedules call this (e.g. persist via API). Otherwise drops are no-ops after confirm. */
  onReschedule?: (
    appointmentId: string,
    newDate: string,
    newTime: string,
    newStaffId: string
  ) => Promise<void>;

  onMobileDateChange?: (date: Date) => void;
  onMobileAddAppointment?: () => void;
  onMobileFilterClick?: () => void;
  onMobileViewChange?: (view: "day" | "3-days" | "week") => void;

  className?: string;
}

export function ProviderScheduler({
  appointments,
  teamMembers,
  services: _services = [],
  timeBlocks = [],
  selectedDate,
  view,
  startHour = 8,
  endHour = 20,
  locationOperatingHours,
  availabilityBlocks,
  businessTimezone,
  onAppointmentClick,
  onTimeSlotClick,
  onTimeBlockClick,
  onCheckout,
  onStatusChange,
  onRefresh,
  onViewWeekSchedule,
  onPrintDaySchedule,
  onEditWorkHours,
  onSetDayOff,
  selectedTeamMemberId,
  onClearStaffFilter,
  onReschedule,
  onMobileDateChange,
  onMobileAddAppointment,
  onMobileFilterClick,
  onMobileViewChange,
  className,
}: ProviderSchedulerProps) {
  const schedulerViewportMd = useMediaQueryMatch(TW_MD_MIN_QUERY);
  const noopReschedule = useCallback(async () => {}, []);
  const handleReschedule = onReschedule ?? noopReschedule;

  const handleAppointmentClick = useCallback(
    (appointment: Appointment) => {
      onAppointmentClick(appointment);
    },
    [onAppointmentClick]
  );

  const handleTimeSlotClick = useCallback(
    (date: Date, time: string, teamMemberId: string) => {
      onTimeSlotClick(date, time, teamMemberId);
    },
    [onTimeSlotClick]
  );

  const handleTimeBlockClick = useCallback(
    (timeBlock: TimeBlock) => {
      onTimeBlockClick?.(timeBlock);
    },
    [onTimeBlockClick]
  );

  const handleCheckout = useCallback(
    (appointment: Appointment) => {
      onCheckout?.(appointment);
    },
    [onCheckout]
  );

  const handleStatusChange = useCallback(
    (appointment: Appointment, status: Appointment["status"]) => {
      onStatusChange?.(appointment, status);
    },
    [onStatusChange]
  );

  const handleMobileDateChange = useCallback(
    (date: Date) => {
      if (date instanceof Date && !isNaN(date.getTime())) {
        onMobileDateChange?.(date);
      }
    },
    [onMobileDateChange]
  );

  const desktopBlock =
    schedulerViewportMd === true ? (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <CalendarDesktopWithDnd
          allAppointments={appointments}
          onReschedule={handleReschedule}
          appointments={appointments}
          teamMembers={teamMembers}
          timeBlocks={timeBlocks}
          availabilityBlocks={availabilityBlocks}
          selectedDate={selectedDate}
          view={view}
          onAppointmentClick={handleAppointmentClick}
          onTimeSlotClick={handleTimeSlotClick}
          onTimeBlockClick={handleTimeBlockClick}
          onCheckout={handleCheckout}
          onStatusChange={handleStatusChange}
          onRefresh={onRefresh}
          startHour={startHour}
          endHour={endHour}
          locationOperatingHours={locationOperatingHours}
          onViewWeekSchedule={onViewWeekSchedule}
          onPrintDaySchedule={onPrintDaySchedule}
          onEditWorkHours={onEditWorkHours}
          onSetDayOff={onSetDayOff}
          businessTimezone={businessTimezone}
        />
      </div>
    ) : null;

  const mobileBlock =
    schedulerViewportMd === false ? (
      <div className="flex flex-1 min-h-0 min-w-0">
        <CalendarMobileWithDnd
          allAppointments={appointments}
          timeBlocks={timeBlocks}
          onReschedule={handleReschedule}
          appointments={appointments}
          teamMembers={teamMembers}
          selectedDate={selectedDate}
          view={view === "week" ? "week" : view === "3-days" ? "3-days" : "day"}
          onDateChange={handleMobileDateChange}
          onAppointmentClick={handleAppointmentClick}
          onTimeSlotClick={handleTimeSlotClick}
          onTimeBlockClick={onTimeBlockClick}
          onRefresh={onRefresh}
          onAddAppointment={() => onMobileAddAppointment?.()}
          onFilterClick={onMobileFilterClick}
          onViewChange={onMobileViewChange}
          onCheckout={handleCheckout}
          onStatusChange={handleStatusChange}
          startHour={startHour}
          endHour={endHour}
          locationOperatingHours={locationOperatingHours}
          availabilityBlocks={availabilityBlocks}
          onViewWeekSchedule={onViewWeekSchedule}
          onPrintDaySchedule={onPrintDaySchedule}
          onEditWorkHours={onEditWorkHours}
          onSetDayOff={onSetDayOff}
          selectedTeamMemberId={selectedTeamMemberId}
          onClearStaffFilter={onClearStaffFilter}
          businessTimezone={businessTimezone}
        />
      </div>
    ) : null;

  return (
    <div className={cn("flex flex-col flex-1 min-h-0 min-w-0 w-full", className)}>
      {schedulerViewportMd === null && (
        <div
          className="flex flex-1 min-h-[240px] items-center justify-center"
          aria-busy="true"
          aria-label="Loading scheduler"
        >
          <RefreshCw className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      )}
      {desktopBlock}
      {mobileBlock}
    </div>
  );
}

export default ProviderScheduler;
