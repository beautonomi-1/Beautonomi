"use client";

import type { ComponentProps } from "react";
import { DragDropProvider } from "@/components/provider-portal/DragDropCalendar";
import { CalendarDesktopView } from "@/components/provider-portal/CalendarDesktopView";
import type { Appointment } from "@/lib/provider-portal/types";

export type CalendarDesktopWithDndProps = ComponentProps<typeof CalendarDesktopView> & {
  /** Full appointment list for conflict checks (usually same as `appointments`). */
  allAppointments: Appointment[];
  onReschedule: (
    appointmentId: string,
    newDate: string,
    newTime: string,
    newStaffId: string
  ) => Promise<void>;
  enableConflictValidation?: boolean;
};

/**
 * Desktop calendar grid + drag-drop in one module so consumers load both in a single async chunk.
 */
export function CalendarDesktopWithDnd({
  allAppointments,
  onReschedule,
  enableConflictValidation = true,
  ...viewProps
}: CalendarDesktopWithDndProps) {
  return (
    <DragDropProvider
      teamMembers={viewProps.teamMembers}
      allAppointments={allAppointments}
      timeBlocks={viewProps.timeBlocks ?? []}
      enableConflictValidation={enableConflictValidation}
      onReschedule={onReschedule}
    >
      <div className="flex flex-1 flex-col min-h-0 min-w-0">
        <CalendarDesktopView {...viewProps} />
      </div>
    </DragDropProvider>
  );
}
