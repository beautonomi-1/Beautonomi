/**
 * Time Utility Functions
 * Helper functions for time calculations and conversions
 */

/**
 * Parse time string (HH:MM:SS or HH:MM) to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const parts = time.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string (HH:MM)
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Check if two time ranges overlap
 */
export function timeRangesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Get date portion of ISO timestamp string
 */
export function getDateFromISO(isoString: string): string {
  return isoString.split('T')[0];
}

/**
 * Create Date object from date string and time string in a specific timezone.
 * When timezone is provided, the returned Date represents the correct UTC instant
 * for the given wall-clock time in that zone.
 */
export function combineDateAndTime(dateStr: string, timeStr: string, timezone?: string): Date {
  const timeParts = timeStr.split(":");
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  const seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;

  if (timezone) {
    const iso = `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const utcGuess = new Date(iso + "Z");
    const parts = formatter.formatToParts(utcGuess);
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
    const wallHour = get("hour") === 24 ? 0 : get("hour");
    const diffMs =
      (wallHour - hours) * 3600000 +
      (get("minute") - minutes) * 60000 +
      (get("second") - seconds) * 1000;
    return new Date(utcGuess.getTime() - diffMs);
  }

  const date = new Date(dateStr);
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

/**
 * Expand recurring pattern to actual dates
 */
export function expandRecurringPattern(
  pattern: {
    frequency: 'weekly' | 'daily' | 'monthly';
    days?: number[];
    end_date?: string;
  },
  startDate: string,
  targetDate: string
): boolean {
  const start = new Date(startDate);
  const target = new Date(targetDate);
  const end = pattern.end_date ? new Date(pattern.end_date) : null;

  if (end && target > end) {
    return false;
  }

  if (pattern.frequency === 'daily') {
    return target >= start;
  }

  if (pattern.frequency === 'weekly' && pattern.days) {
    const targetDay = target.getDay();
    return pattern.days.includes(targetDay) && target >= start;
  }

  if (pattern.frequency === 'monthly') {
    // Same day of month
    return target.getDate() === start.getDate() && target >= start;
  }

  return false;
}

/**
 * Generate 15-minute interval slots between start and end time
 */
export function generateTimeSlots(startTime: string, endTime: string, intervalMinutes: number = 15): string[] {
  const slots: string[] = [];
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  for (let minutes = start; minutes < end; minutes += intervalMinutes) {
    slots.push(minutesToTime(minutes));
  }

  return slots;
}
