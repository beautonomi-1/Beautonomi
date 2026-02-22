/**
 * Scheduler Utilities
 * 
 * Helper functions for calendar operations.
 */

import { format, addDays, startOfWeek, isSameDay, getDay } from "date-fns";
import type { CalendarEvent, CalendarTimeBlock, ConflictValidation } from "./types";

/**
 * Generate time slots for a given range
 */
export function generateTimeSlots(
  startHour: number,
  endHour: number,
  slotDuration: number = 60
): string[] {
  const slots: string[] = [];
  const totalMinutes = (endHour - startHour) * 60;
  const slotCount = Math.floor(totalMinutes / slotDuration);
  
  for (let i = 0; i <= slotCount; i++) {
    const totalMins = startHour * 60 + i * slotDuration;
    const hour = Math.floor(totalMins / 60);
    const min = totalMins % 60;
    
    if (hour <= endHour) {
      slots.push(`${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
    }
  }
  
  return slots;
}

/**
 * Get dates for calendar view
 */
export function getDatesForView(
  selectedDate: Date,
  view: "day" | "week" | "3-days"
): Date[] {
  const dates: Date[] = [];
  
  if (view === "day") {
    dates.push(new Date(selectedDate));
  } else if (view === "3-days") {
    for (let i = 0; i < 3; i++) {
      dates.push(addDays(selectedDate, i));
    }
  } else {
    // Week view
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) {
      dates.push(addDays(weekStart, i));
    }
  }
  
  return dates;
}

/**
 * Check if date is weekend
 */
export function isWeekend(date: Date): boolean {
  const day = getDay(date);
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Get events for a specific date and resource
 */
export function getEventsForDateAndResource(
  events: CalendarEvent[],
  date: Date,
  resourceId: string
): CalendarEvent[] {
  const dateStr = format(date, "yyyy-MM-dd");
  return events.filter(
    event => event.date === dateStr && event.resourceId === resourceId
  );
}

/**
 * Get time blocks for a specific date and resource
 */
export function getTimeBlocksForDateAndResource(
  timeBlocks: CalendarTimeBlock[],
  date: Date,
  resourceId: string
): CalendarTimeBlock[] {
  const dateStr = format(date, "yyyy-MM-dd");
  return timeBlocks.filter(
    block => block.date === dateStr && block.resourceId === resourceId
  );
}

/**
 * Check for appointment conflicts
 */
export function checkConflicts(
  newEvent: {
    date: string;
    startTime: string;
    endTime: string;
    resourceId: string;
  },
  existingEvents: CalendarEvent[],
  excludeEventId?: string
): ConflictValidation {
  const conflicts: Array<{ appointmentId: string; reason: string }> = [];
  
  // Filter events for same date and resource
  const relevantEvents = existingEvents.filter(
    event =>
      event.date === newEvent.date &&
      event.resourceId === newEvent.resourceId &&
      event.id !== excludeEventId
  );
  
  // Check for time overlaps
  for (const event of relevantEvents) {
    if (timeRangesOverlap(
      newEvent.startTime,
      newEvent.endTime,
      event.startTime,
      event.endTime
    )) {
      conflicts.push({
        appointmentId: event.id,
        reason: `Overlaps with ${event.title} (${event.startTime} - ${event.endTime})`,
      });
    }
  }
  
  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    canOverride: true, // Allow override with warning
  };
}

/**
 * Check if two time ranges overlap
 */
export function timeRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const [h1, m1] = start1.split(":").map(Number);
  const [h2, m2] = end1.split(":").map(Number);
  const [h3, m3] = start2.split(":").map(Number);
  const [h4, m4] = end2.split(":").map(Number);
  
  const mins1 = h1 * 60 + m1;
  const mins2 = h2 * 60 + m2;
  const mins3 = h3 * 60 + m3;
  const mins4 = h4 * 60 + m4;
  
  return mins1 < mins4 && mins2 > mins3;
}

/**
 * Snap time to nearest interval
 */
export function snapToInterval(
  time: string,
  intervalMinutes: number = 15
): string {
  const [hour, min] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + min;
  const snappedMinutes = Math.round(totalMinutes / intervalMinutes) * intervalMinutes;
  const snappedHour = Math.floor(snappedMinutes / 60);
  const snappedMin = snappedMinutes % 60;
  
  return `${snappedHour.toString().padStart(2, "0")}:${snappedMin.toString().padStart(2, "0")}`;
}

/**
 * Get current time as HH:MM
 */
export function getCurrentTime(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * Check if time is in the past
 */
export function isTimePast(date: string, time: string): boolean {
  const appointmentDate = new Date(`${date}T${time}`);
  return appointmentDate < new Date();
}

/**
 * Sort events by start time
 */
export function sortEventsByTime(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.startTime.localeCompare(b.startTime);
  });
}

/**
 * Group events by date
 */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();
  
  for (const event of events) {
    if (!grouped.has(event.date)) {
      grouped.set(event.date, []);
    }
    grouped.get(event.date)!.push(event);
  }
  
  return grouped;
}

/**
 * Group events by resource
 */
export function groupEventsByResource(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();
  
  for (const event of events) {
    if (!grouped.has(event.resourceId)) {
      grouped.set(event.resourceId, []);
    }
    grouped.get(event.resourceId)!.push(event);
  }
  
  return grouped;
}

/**
 * Calculate total duration for events
 */
export function calculateTotalDuration(events: CalendarEvent[]): number {
  return events.reduce((total, event) => total + event.duration, 0);
}

/**
 * Format duration for display
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}m`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}m`;
  }
}

/**
 * Get date range label
 */
export function getDateRangeLabel(dates: Date[]): string {
  if (dates.length === 0) return "";
  if (dates.length === 1) return format(dates[0], "EEE, MMM d, yyyy");
  
  const first = dates[0];
  const last = dates[dates.length - 1];
  
  if (isSameDay(first, last)) {
    return format(first, "EEE, MMM d, yyyy");
  }
  
  return `${format(first, "MMM d")} - ${format(last, "d, yyyy")}`;
}

/**
 * Get short day label
 */
export function getShortDayLabel(date: Date): string {
  return format(date, "EEE d");
}

/**
 * Get time label with optional 12-hour format
 */
export function getTimeLabel(time: string, use12Hour: boolean = true): string {
  if (!use12Hour) return time;
  
  const [hour, min] = time.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  
  // Only show minutes if not on the hour
  if (min === 0) {
    return `${displayHour} ${period}`;
  }
  
  return `${displayHour}:${min.toString().padStart(2, "0")} ${period}`;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Create cache key from parameters
 */
export function createCacheKey(params: Record<string, any>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}
