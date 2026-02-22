/**
 * Scheduler Adapter
 * 
 * Transforms backend data types into calendar-friendly types.
 * This is the ONLY module that should know about both backend and calendar types.
 * 
 * Responsibilities:
 * - Convert Appointment → CalendarEvent
 * - Convert TeamMember → CalendarResource
 * - Convert TimeBlock → CalendarTimeBlock
 * - Generate visual styles based on preferences
 * - Handle drag/drop transformations
 */

import type { Appointment, TeamMember, TimeBlock } from "@/lib/provider-portal/types";
import type {
  CalendarEvent,
  CalendarResource,
  CalendarTimeBlock,
  EventStyle,
  BlockStyle,
  AppointmentUpdatePayload,
  DragDropEvent,
  CalendarPreferences,
} from "./types";
import { differenceInHours } from "date-fns";
import { getAppointmentVisualStyle } from "@/lib/scheduling/visualMapping";
import { mapStatus, AppointmentStatus } from "@/lib/scheduling/mangomintAdapter";

/**
 * Convert Appointment to CalendarEvent
 */
export function toCalendarEvent(
  appointment: Appointment,
  preferences: CalendarPreferences = {
    colorBy: "status",
    showCanceled: true,
    showCompleted: true,
    showTimeBlocks: true,
    showCurrentTimeIndicator: true,
    compactMode: false,
    use12HourFormat: true,
  }
): CalendarEvent {
  const isNew = isNewBooking(appointment.created_date);
  const style = getEventStyle(appointment, preferences);
  
  // Calculate end time
  const endTime = calculateEndTime(appointment.scheduled_time, appointment.duration_minutes);
  
  return {
    id: appointment.id,
    title: appointment.client_name,
    subtitle: appointment.service_name,
    startTime: appointment.scheduled_time,
    endTime,
    date: appointment.scheduled_date,
    resourceId: appointment.team_member_id,
    duration: appointment.duration_minutes,
    style,
    metadata: {
      appointment,
      isNew,
      canEdit: canEditAppointment(appointment),
      canDelete: canDeleteAppointment(appointment),
      canReschedule: canRescheduleAppointment(appointment),
    },
  };
}

/**
 * Convert TeamMember to CalendarResource
 */
export function toCalendarResource(teamMember: TeamMember): CalendarResource {
  return {
    id: teamMember.id,
    name: teamMember.name,
    avatar: teamMember.avatar_url,
    role: teamMember.role,
    isActive: true,
  };
}

/**
 * Convert TimeBlock to CalendarTimeBlock
 */
export function toCalendarTimeBlock(timeBlock: TimeBlock): CalendarTimeBlock {
  // TimeBlock doesn't have a type field, so we default to "blocked"
  const blockType = "blocked";
  const style = getBlockStyle(blockType);
  
  return {
    id: timeBlock.id,
    resourceId: timeBlock.team_member_id || "",
    date: timeBlock.date,
    startTime: timeBlock.start_time,
    endTime: timeBlock.end_time,
    type: blockType,
    label: timeBlock.name || "Blocked Time",
    style,
    metadata: {
      timeBlock,
      canEdit: true,
    },
  };
}

/**
 * Convert DragDropEvent to AppointmentUpdatePayload
 */
export function fromDragDropEvent(event: DragDropEvent): AppointmentUpdatePayload {
  return {
    scheduled_date: event.newDate,
    scheduled_time: event.newTime,
    team_member_id: event.newResourceId,
  };
}

/**
 * Get visual style for an appointment
 */
export function getEventStyle(
  appointment: Appointment,
  preferences: CalendarPreferences
): EventStyle {
  const mangomintStatus = mapStatus(appointment);
  
  // Check if should be hidden
  if (mangomintStatus === AppointmentStatus.CANCELED && !preferences.showCanceled) {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      textColor: "transparent",
      opacity: 0,
      className: "hidden",
    };
  }
  
  if (mangomintStatus === AppointmentStatus.COMPLETED && !preferences.showCompleted) {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      textColor: "transparent",
      opacity: 0,
      className: "hidden",
    };
  }
  
  // Use existing visual mapping
  const visualStyle = getAppointmentVisualStyle(
    mangomintStatus,
    appointment.service_name,
    {
      colorBy: preferences.colorBy === "team_member" ? "status" : preferences.colorBy,
      showCanceled: preferences.showCanceled,
    }
  );
  
  return {
    backgroundColor: visualStyle.backgroundColor,
    borderColor: visualStyle.borderColor,
    textColor: visualStyle.textColor,
    opacity: visualStyle.opacity,
    className: "",
  };
}

/**
 * Get visual style for a time block
 */
export function getBlockStyle(type: string): BlockStyle {
  const styles: Record<string, BlockStyle> = {
    break: {
      backgroundColor: "#f3f4f6",
      borderColor: "#d1d5db",
      textColor: "#6b7280",
      pattern: "striped",
      opacity: 0.8,
    },
    lunch: {
      backgroundColor: "#fef3c7",
      borderColor: "#fbbf24",
      textColor: "#92400e",
      pattern: "striped",
      opacity: 0.8,
    },
    time_off: {
      backgroundColor: "#dbeafe",
      borderColor: "#60a5fa",
      textColor: "#1e40af",
      pattern: "solid",
      opacity: 0.9,
    },
    holiday: {
      backgroundColor: "#fce7f3",
      borderColor: "#f472b6",
      textColor: "#831843",
      pattern: "solid",
      opacity: 0.9,
    },
    blocked: {
      backgroundColor: "#fee2e2",
      borderColor: "#f87171",
      textColor: "#991b1b",
      pattern: "striped",
      opacity: 0.8,
    },
    custom: {
      backgroundColor: "#e0e7ff",
      borderColor: "#818cf8",
      textColor: "#3730a3",
      pattern: "dotted",
      opacity: 0.8,
    },
  };
  
  return styles[type] || styles.custom;
}

/**
 * Calculate end time from start time and duration
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hour, min] = startTime.split(":").map(Number);
  const totalMinutes = hour * 60 + min + durationMinutes;
  const endHour = Math.floor(totalMinutes / 60);
  const endMin = totalMinutes % 60;
  return `${endHour.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`;
}

/**
 * Check if appointment was created recently (< 24 hours)
 */
export function isNewBooking(createdDate: string): boolean {
  const created = new Date(createdDate);
  const now = new Date();
  return differenceInHours(now, created) < 24;
}

/**
 * Check if appointment can be edited
 */
export function canEditAppointment(appointment: Appointment): boolean {
  // Can't edit completed or cancelled appointments
  if (appointment.status === "completed" || appointment.status === "cancelled") {
    return false;
  }
  
  // Can't edit past appointments
  const appointmentDate = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}`);
  if (appointmentDate < new Date()) {
    return false;
  }
  
  return true;
}

/**
 * Check if appointment can be deleted
 */
export function canDeleteAppointment(_appointment: Appointment): boolean {
  // Generally allow deletion unless there are specific business rules
  return true;
}

/**
 * Check if appointment can be rescheduled
 */
export function canRescheduleAppointment(appointment: Appointment): boolean {
  // Can't reschedule completed or cancelled appointments
  if (appointment.status === "completed" || appointment.status === "cancelled") {
    return false;
  }
  
  return true;
}

/**
 * Map backend block type to calendar block type
 */
function _mapBlockType(type: string): CalendarTimeBlock["type"] {
  const mapping: Record<string, CalendarTimeBlock["type"]> = {
    break: "break",
    lunch: "lunch",
    time_off: "time_off",
    holiday: "holiday",
    blocked: "blocked",
  };
  
  return mapping[type] || "custom";
}

/**
 * Get human-readable label for block type
 */
function _getBlockLabel(type: string): string {
  const labels: Record<string, string> = {
    break: "Break",
    lunch: "Lunch Break",
    time_off: "Time Off",
    holiday: "Holiday",
    blocked: "Blocked Time",
    custom: "Unavailable",
  };
  
  return labels[type] || "Unavailable";
}

/**
 * Batch convert appointments to calendar events
 */
export function toCalendarEvents(
  appointments: Appointment[],
  preferences?: CalendarPreferences
): CalendarEvent[] {
  return appointments.map(apt => toCalendarEvent(apt, preferences));
}

/**
 * Batch convert team members to calendar resources
 */
export function toCalendarResources(teamMembers: TeamMember[]): CalendarResource[] {
  return teamMembers.map(toCalendarResource);
}

/**
 * Batch convert time blocks to calendar time blocks
 */
export function toCalendarTimeBlocks(timeBlocks: TimeBlock[]): CalendarTimeBlock[] {
  return timeBlocks.map(toCalendarTimeBlock);
}

/**
 * Format time for display (12-hour or 24-hour)
 */
export function formatDisplayTime(time: string, use12Hour: boolean = true): string {
  const [hour, min] = time.split(":").map(Number);
  
  if (!use12Hour) {
    return time;
  }
  
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${min.toString().padStart(2, "0")} ${period}`;
}

/**
 * Parse display time back to 24-hour format
 */
export function parseDisplayTime(displayTime: string): string {
  const match = displayTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return displayTime;
  
  const [, hourStr, minStr, period] = match;
  let hour = parseInt(hourStr);
  const min = parseInt(minStr);
  
  if (period.toUpperCase() === "PM" && hour !== 12) {
    hour += 12;
  } else if (period.toUpperCase() === "AM" && hour === 12) {
    hour = 0;
  }
  
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}
