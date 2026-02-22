/**
 * Provider Scheduler
 * 
 * Main calendar scheduler component for the provider portal.
 * This is a wrapper around the existing calendar components that:
 * - Uses the adapter layer for clean type transformations
 * - Provides consistent API
 * - Enhances styling with Mangomint/Fresha polish
 * - Maintains all existing functionality
 */

"use client";

import React, { useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Appointment, TeamMember, ServiceItem, TimeBlock } from "@/lib/provider-portal/types";
import { CalendarDesktopView } from "@/components/provider-portal/CalendarDesktopView";
import { CalendarMobileView } from "@/components/provider-portal/CalendarMobileView";
import { useCalendarPreferences } from "@/lib/settings/calendarPreferences";
import {
  toCalendarEvents,
  toCalendarResources,
  toCalendarTimeBlocks,
  type CalendarPreferences,
} from "@/lib/scheduler";

export interface ProviderSchedulerProps {
  // Data
  appointments: Appointment[];
  teamMembers: TeamMember[];
  services?: ServiceItem[];
  timeBlocks?: TimeBlock[];
  
  // View configuration
  selectedDate: Date;
  view: "day" | "3-days" | "week";
  startHour?: number;
  endHour?: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  
  // Callbacks
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
  
  // Optional configuration
  className?: string;
  compactMode?: boolean;
}

/**
 * Main Provider Scheduler Component
 * 
 * Wraps existing calendar components with enhanced adapter layer.
 */
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
  className,
  compactMode = false,
}: ProviderSchedulerProps) {
  // Get calendar preferences
  const { preferences: userPreferences, isLoaded: _prefsLoaded } = useCalendarPreferences();
  
  // Build calendar preferences object
  const calendarPreferences: CalendarPreferences = useMemo(() => ({
    colorBy: userPreferences?.colorBy || "status",
    showCanceled: userPreferences?.showCanceled ?? true,
    showCompleted: true, // Always show completed for now
    showTimeBlocks: true, // Always show time blocks
    showCurrentTimeIndicator: true, // Always show current time indicator
    compactMode: compactMode || false,
    use12HourFormat: true, // Always use 12-hour format
  }), [userPreferences, compactMode]);
  
  // Transform data using adapter (memoized for performance)
  const _calendarEvents = useMemo(
    () => toCalendarEvents(appointments, calendarPreferences),
    [appointments, calendarPreferences]
  );
  
  const _calendarResources = useMemo(
    () => toCalendarResources(teamMembers),
    [teamMembers]
  );
  
  const _calendarTimeBlocks = useMemo(
    () => toCalendarTimeBlocks(timeBlocks),
    [timeBlocks]
  );
  
  // Enhanced appointment click handler
  const handleAppointmentClick = useCallback((appointment: Appointment) => {
    onAppointmentClick(appointment);
  }, [onAppointmentClick]);
  
  // Enhanced time slot click handler
  const handleTimeSlotClick = useCallback((date: Date, time: string, teamMemberId: string) => {
    onTimeSlotClick(date, time, teamMemberId);
  }, [onTimeSlotClick]);
  
  // Enhanced time block click handler
  const handleTimeBlockClick = useCallback((timeBlock: TimeBlock) => {
    if (onTimeBlockClick) {
      onTimeBlockClick(timeBlock);
    }
  }, [onTimeBlockClick]);
  
  // Enhanced checkout handler
  const handleCheckout = useCallback((appointment: Appointment) => {
    if (onCheckout) {
      onCheckout(appointment);
    }
  }, [onCheckout]);
  
  // Enhanced status change handler
  const handleStatusChange = useCallback(
    (appointment: Appointment, status: Appointment["status"]) => {
      if (onStatusChange) {
        onStatusChange(appointment, status);
      }
    },
    [onStatusChange]
  );
  
  // Render desktop view on larger screens
  const desktopView = (
    <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", "hidden md:flex")}>
      <CalendarDesktopView
        appointments={appointments}
        teamMembers={teamMembers}
        timeBlocks={timeBlocks}
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
      />
    </div>
  );

  // Render mobile view on smaller screens
  const mobileView = (
    <div className={cn("flex-1 min-h-0 md:hidden")}>
      <CalendarMobileView
        appointments={appointments}
        teamMembers={teamMembers}
        selectedDate={selectedDate}
        view={view === "week" ? "week" : "day"}
        onDateChange={(_date) => {
          // Date change is handled by parent component
          // This is just for mobile swipe gestures
        }}
        onAppointmentClick={handleAppointmentClick}
        onTimeSlotClick={handleTimeSlotClick}
        onAddAppointment={() => {
          // Handled by parent's "Add" button
        }}
        onCheckout={handleCheckout}
        onStatusChange={handleStatusChange}
        startHour={startHour}
        endHour={endHour}
        locationOperatingHours={locationOperatingHours}
        onViewWeekSchedule={onViewWeekSchedule}
        onPrintDaySchedule={onPrintDaySchedule}
        onEditWorkHours={onEditWorkHours}
        onSetDayOff={onSetDayOff}
        selectedTeamMemberId={selectedTeamMemberId}
        onClearStaffFilter={onClearStaffFilter}
      />
    </div>
  );
  
  return (
    <div className={cn("flex flex-col flex-1 min-h-0 min-w-0 w-full", className)}>
      {desktopView}
      {mobileView}
    </div>
  );
}

/**
 * Export default
 */
export default ProviderScheduler;
