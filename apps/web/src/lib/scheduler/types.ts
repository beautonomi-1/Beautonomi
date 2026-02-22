/**
 * Scheduler Types
 * 
 * Clean type definitions for the calendar scheduler.
 * These types serve as the "contract" between the backend data
 * and the calendar UI components.
 */

import type { Appointment, TimeBlock } from "@/lib/provider-portal/types";

/**
 * Calendar Event - Represents a single appointment in the calendar
 */
export interface CalendarEvent {
  id: string;
  title: string;
  subtitle?: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  date: string; // "YYYY-MM-DD"
  resourceId: string; // team_member_id
  duration: number; // minutes
  style: EventStyle;
  metadata: EventMetadata;
}

/**
 * Calendar Resource - Represents a staff member/resource column
 */
export interface CalendarResource {
  id: string;
  name: string;
  avatar?: string;
  color?: string;
  role?: string;
  isActive?: boolean;
}

/**
 * Event Style - Visual styling for calendar events
 */
export interface EventStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  opacity?: number;
  className?: string;
  icon?: string;
}

/**
 * Event Metadata - Additional data attached to events
 */
export interface EventMetadata {
  appointment: Appointment;
  isNew: boolean; // Created within last 24 hours
  canEdit: boolean;
  canDelete: boolean;
  canReschedule: boolean;
  hasConflict?: boolean;
}

/**
 * Calendar Time Block - Represents blocked/unavailable time
 */
export interface CalendarTimeBlock {
  id: string;
  resourceId: string; // team_member_id
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  type: "break" | "lunch" | "time_off" | "holiday" | "blocked" | "custom";
  label?: string;
  style: BlockStyle;
  metadata: {
    timeBlock: TimeBlock;
    canEdit: boolean;
  };
}

/**
 * Block Style - Visual styling for time blocks
 */
export interface BlockStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  pattern?: "solid" | "striped" | "dotted";
  opacity?: number;
}

/**
 * Calendar View Configuration
 */
export interface CalendarViewConfig {
  type: "day" | "week" | "3-days" | "month";
  startHour: number;
  endHour: number;
  slotDuration: number; // minutes
  showWeekends: boolean;
  firstDayOfWeek: 0 | 1; // 0 = Sunday, 1 = Monday
}

/**
 * Calendar Preferences
 */
export interface CalendarPreferences {
  colorBy: "status" | "service" | "team_member";
  showCanceled: boolean;
  showCompleted: boolean;
  showTimeBlocks: boolean;
  showCurrentTimeIndicator: boolean;
  compactMode: boolean;
  use12HourFormat: boolean;
}

/**
 * Drag & Drop Event
 */
export interface DragDropEvent {
  eventId: string;
  newDate: string;
  newTime: string;
  newResourceId: string;
  oldDate: string;
  oldTime: string;
  oldResourceId: string;
}

/**
 * Resize Event
 */
export interface ResizeEvent {
  eventId: string;
  newDuration: number;
  oldDuration: number;
}

/**
 * Slot Click Event
 */
export interface SlotClickEvent {
  date: Date;
  time: string;
  resourceId: string;
  resource: CalendarResource;
}

/**
 * Event Click Event
 */
export interface EventClickEvent {
  event: CalendarEvent;
  nativeEvent: React.MouseEvent;
}

/**
 * Calendar State
 */
export interface CalendarState {
  selectedDate: Date;
  view: CalendarViewConfig["type"];
  selectedResources: string[]; // filtered staff IDs
  isLoading: boolean;
  error: string | null;
}

/**
 * Update Payload - Data sent to backend for updates
 */
export interface AppointmentUpdatePayload {
  scheduled_date?: string;
  scheduled_time?: string;
  team_member_id?: string;
  duration_minutes?: number;
  status?: Appointment["status"];
  notes?: string;
}

/**
 * Conflict Validation Result
 */
export interface ConflictValidation {
  hasConflict: boolean;
  conflicts: Array<{
    appointmentId: string;
    reason: string;
  }>;
  canOverride: boolean;
}

/**
 * Calendar Data Response
 */
export interface CalendarDataResponse {
  events: CalendarEvent[];
  resources: CalendarResource[];
  timeBlocks: CalendarTimeBlock[];
  dateRange: {
    start: string;
    end: string;
  };
}
