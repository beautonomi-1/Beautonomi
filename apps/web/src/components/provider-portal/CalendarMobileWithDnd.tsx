"use client";

import type { ComponentProps } from "react";
import { DragDropProvider } from "@/components/provider-portal/DragDropCalendar";
import { CalendarMobileView } from "@/components/provider-portal/CalendarMobileView";
import type { Appointment, TimeBlock } from "@/lib/provider-portal/types";

export type CalendarMobileWithDndProps = ComponentProps<typeof CalendarMobileView> & {
  allAppointments: Appointment[];
  timeBlocks?: TimeBlock[];
  onReschedule: (
    appointmentId: string,
    newDate: string,
    newTime: string,
    newStaffId: string
  ) => Promise<void>;
  enableConflictValidation?: boolean;
};

/**
 * Mobile calendar + drag-drop in one module so consumers load both in a single async chunk.
 */
export function CalendarMobileWithDnd({
  allAppointments,
  timeBlocks = [],
  onReschedule,
  enableConflictValidation = true,
  availabilityBlocks = [],
  ...mobileProps
}: CalendarMobileWithDndProps) {
  return (
    <DragDropProvider
      teamMembers={mobileProps.teamMembers}
      allAppointments={allAppointments}
      timeBlocks={timeBlocks}
      availabilityBlocks={availabilityBlocks}
      enableConflictValidation={enableConflictValidation}
      onReschedule={onReschedule}
    >
      <CalendarMobileView
        {...mobileProps}
        availabilityBlocks={availabilityBlocks}
        timeBlocks={timeBlocks}
      />
    </DragDropProvider>
  );
}
