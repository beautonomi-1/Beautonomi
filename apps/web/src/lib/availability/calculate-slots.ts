/**
 * Calculate Available Slots
 * Core algorithm for determining available time slots
 */

import type {
  AvailabilityConstraints,
  TimeSlot,
  TimeBlock,
  BookingService,
  TimeSegment,
} from './types';
import { formatInTimeZone } from 'date-fns-tz';
import {
  timeToMinutes,
  minutesToTime,
  timeRangesOverlap,
  combineDateAndTime,
  generateTimeSlots,
} from './time-utils';

/**
 * Calculate time segments for a booking service
 * Returns segments: service (blocked), buffer (blocked), processing (available), finishing (blocked)
 */
export function calculateBookingSegments(booking: BookingService, _date: string): TimeSegment[] {
  const segments: TimeSegment[] = [];

  const serviceStart = new Date(booking.scheduled_start_at);
  const serviceEnd = new Date(booking.scheduled_end_at);
  const bufferMinutes = booking.buffer_minutes || 0;
  const processingMinutes = booking.processing_minutes || 0;
  const finishingMinutes = booking.finishing_minutes || 0;

  // Service segment (blocked)
  segments.push({
    start: serviceStart,
    end: serviceEnd,
    type: 'blocked',
  });

  // Buffer segment (blocked)
  if (bufferMinutes > 0) {
    const bufferStart = new Date(serviceEnd);
    const bufferEnd = new Date(bufferStart.getTime() + bufferMinutes * 60000);
    segments.push({
      start: bufferStart,
      end: bufferEnd,
      type: 'blocked',
    });
  }

  // Processing segment (available - provider is free)
  if (processingMinutes > 0) {
    const processingStart = new Date(serviceEnd.getTime() + bufferMinutes * 60000);
    const processingEnd = new Date(processingStart.getTime() + processingMinutes * 60000);
    segments.push({
      start: processingStart,
      end: processingEnd,
      type: 'available',
    });
  }

  // Finishing segment (blocked)
  if (finishingMinutes > 0) {
    const finishingStart = new Date(
      serviceEnd.getTime() + bufferMinutes * 60000 + processingMinutes * 60000
    );
    const finishingEnd = new Date(finishingStart.getTime() + finishingMinutes * 60000);
    segments.push({
      start: finishingStart,
      end: finishingEnd,
      type: 'blocked',
    });
  }

  return segments;
}

/**
 * Check if a time slot overlaps with any blocked segments
 */
function slotOverlapsBlockedSegments(
  slotStart: Date,
  slotEnd: Date,
  blockedSegments: TimeSegment[]
): boolean {
  return blockedSegments.some((segment) => {
    if (segment.type === 'blocked') {
      return timeRangesOverlap(slotStart, slotEnd, segment.start, segment.end);
    }
    return false;
  });
}

/**
 * Check if a time slot overlaps with a time block
 */
function slotOverlapsTimeBlock(
  slotStart: Date,
  slotEnd: Date,
  timeBlock: TimeBlock,
  date: string,
  timezone?: string
): boolean {
  const blockStart = combineDateAndTime(date, timeBlock.start_time, timezone);
  let blockEnd = combineDateAndTime(date, timeBlock.end_time, timezone);
  if (blockEnd <= blockStart) {
    blockEnd = new Date(blockEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  return timeRangesOverlap(slotStart, slotEnd, blockStart, blockEnd);
}

function addDaysToDateKey(date: string, days: number): string {
  if (days === 0) return date;
  const d = new Date(`${date}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftMinuteRanges(shift: { start_time: string; end_time: string }): Array<{ start: number; end: number; dayOffset: number }> {
  const start = timeToMinutes(shift.start_time.substring(0, 5));
  const end = timeToMinutes(shift.end_time.substring(0, 5));
  if (end > start) return [{ start, end, dayOffset: 0 }];
  if (end < start) {
    return [
      { start, end: 24 * 60, dayOffset: 0 },
      { start: 0, end, dayOffset: 1 },
    ];
  }
  return [];
}

/**
 * Apply gap avoidance filter
 * Only show slots at start/end of day or adjacent to existing appointments
 */
function applyGapAvoidance(
  slots: TimeSlot[],
  existingBookings: BookingService[],
  workStart: string,
  workEnd: string,
  _date: string,
  timezone?: string,
  requiredMinutes = 60,
  slotInterval = 15,
): TimeSlot[] {
  const minutesInBookingZone = (value: string): number => {
    const d = new Date(value);
    if (timezone) {
      try {
        const [h, m] = formatInTimeZone(d, timezone, 'HH:mm').split(':').map(Number);
        return h * 60 + m;
      } catch {
        // Fall through to historical runtime-local behaviour.
      }
    }
    return d.getHours() * 60 + d.getMinutes();
  };

  if (existingBookings.length === 0) {
    // No appointments: only show start and end of day slots
    const startSlot = slots.find((s) => s.time === workStart);
    const endSlot = slots.find((s) => {
      const slotMinutes = timeToMinutes(s.time);
      const endMinutes = timeToMinutes(workEnd);
      // Find last slot that fits the actual requested booking span before work end.
      return slotMinutes < endMinutes && slotMinutes + requiredMinutes <= endMinutes && slotMinutes + requiredMinutes + slotInterval > endMinutes;
    });

    return slots.filter((s) => s === startSlot || s === endSlot);
  }

  // Has appointments: only show slots adjacent to existing appointments
  const adjacentSlots = new Set<string>();

  // Slots before each appointment
  existingBookings.forEach((booking) => {
    const bookingStartMinutes = minutesInBookingZone(booking.scheduled_start_at);
    
    // Find slot one grid interval before appointment
    const beforeSlot = slots.find((s) => {
      const slotMinutes = timeToMinutes(s.time);
      return slotMinutes === bookingStartMinutes - slotInterval;
    });
    if (beforeSlot) {
      adjacentSlots.add(beforeSlot.time);
    }
  });

  // Slots after each appointment
  existingBookings.forEach((booking) => {
    const bufferMinutes = booking.buffer_minutes || 0;
    const totalEndMinutes = minutesInBookingZone(booking.scheduled_end_at) + bufferMinutes;
    
    // Find slot 15 minutes after appointment ends (including buffer)
    const afterSlot = slots.find((s) => {
      const slotMinutes = timeToMinutes(s.time);
      return slotMinutes === totalEndMinutes;
    });
    if (afterSlot) {
      adjacentSlots.add(afterSlot.time);
    }
  });

  // Also include start and end of day
  const startSlot = slots.find((s) => s.time === workStart);
  if (startSlot) {
    adjacentSlots.add(startSlot.time);
  }

  return slots.filter((s) => adjacentSlots.has(s.time));
}

/**
 * Calculate available time slots
 */
export function calculateAvailableSlots(
  constraints: AvailabilityConstraints & { workHoursEnabled?: boolean },
  duration: number,
  date: string,
  options: {
    slotInterval?: number; // Default 15 minutes
    avoidGaps?: boolean;
    travelBuffer?: number; // For at-home bookings
    /**
     * §Release-audit 2026-04: when provided, each `HH:MM` slot is combined
     * with `date` in this IANA zone (e.g. `Africa/Johannesburg`) so the
     * produced `Date` instants correspond to the provider's actual wall
     * clock. Without it we fall back to the historical UTC behaviour,
     * which only matched the wall clock when the server ran in UTC — and
     * caused the "invalid time / slot taken" web booking bug in SAST/+2h
     * zones when the ISO `Z` label was later re-parsed as provider-local.
     */
    timezone?: string;
  } = {}
): TimeSlot[] {
  const { staffShifts, timeBlocks, existingBookings, workHoursEnabled = true } = constraints;
  const { slotInterval = 15, avoidGaps = false, travelBuffer = 0, timezone } = options;

  // Last-resort fallback: no location hours resolved and work_hours_enabled is false.
  // loadAvailabilityConstraints normally resolves location hours into staffShifts
  // when work_hours_enabled=false, so this branch only fires if no location is configured.
  if (!workHoursEnabled) {
    console.warn(
      '[calculateAvailableSlots] workHoursEnabled=false fallback reached — ' +
      'no location hours resolved. Returning empty slots.',
      { date }
    );
    return [];
  }

  // If work hours are enabled but no shifts, return empty
  if (staffShifts.length === 0) {
    return [];
  }

  // Union slots across ALL shifts (supports split shifts like 09:00-12:00 + 14:00-18:00)
  const allSlotTimesSet = new Set<string>();
  for (const shift of staffShifts) {
    for (const range of shiftMinuteRanges(shift)) {
      for (const t of generateTimeSlots(minutesToTime(range.start), minutesToTime(range.end), slotInterval)) {
        allSlotTimesSet.add(t);
      }
    }
  }
  const allSlots = [...allSlotTimesSet].sort();

  // Earliest start / latest end across all shifts (for gap avoidance)
  const overallWorkStart = staffShifts.reduce(
    (min, s) => Math.min(min, ...shiftMinuteRanges(s).map((r) => r.start)),
    24 * 60
  );
  const overallWorkEnd = staffShifts.reduce(
    (max, s) => Math.max(max, ...shiftMinuteRanges(s).map((r) => r.end)),
    0
  );

  // Calculate blocked segments from existing bookings
  const blockedSegments: TimeSegment[] = [];
  existingBookings.forEach((booking) => {
    const segments = calculateBookingSegments(booking, date);
    blockedSegments.push(...segments.filter((s) => s.type === 'blocked'));
  });

  // Check each slot for availability
  const availableSlots: TimeSlot[] = allSlots.map((slotTime) => {
    const slotStartMinutes = timeToMinutes(slotTime);
    const slotEndMinutes = slotStartMinutes + duration + travelBuffer;

    // Slot + duration must fit entirely within at least one shift
    const fittingRange = staffShifts
      .flatMap((shift) => shiftMinuteRanges(shift))
      .find((range) => slotStartMinutes >= range.start && slotEndMinutes <= range.end);
    const fitsInAnyShift = Boolean(fittingRange);

    if (!fitsInAnyShift) {
      return {
        time: slotTime,
        available: false,
        reason: 'Extends beyond work hours',
      };
    }

    // Convert to Date objects for overlap checking
    const slotDate = addDaysToDateKey(date, fittingRange?.dayOffset ?? 0);
    const slotStart = combineDateAndTime(slotDate, slotTime, timezone);
    const slotEnd = combineDateAndTime(slotDate, minutesToTime(slotEndMinutes), timezone);

    // Check overlap with blocked segments
    if (slotOverlapsBlockedSegments(slotStart, slotEnd, blockedSegments)) {
      return {
        time: slotTime,
        available: false,
        reason: 'Conflicts with existing booking',
      };
    }

    // Check overlap with time blocks
    const overlapsBlock = timeBlocks.some((block) =>
      slotOverlapsTimeBlock(slotStart, slotEnd, block, date, timezone)
    );
    if (overlapsBlock) {
      return {
        time: slotTime,
        available: false,
        reason: 'Time block',
      };
    }

    return {
      time: slotTime,
      available: true,
    };
  });

  // Apply gap avoidance if enabled
  if (avoidGaps) {
    return applyGapAvoidance(
      availableSlots,
      existingBookings,
      minutesToTime(overallWorkStart),
      minutesToTime(overallWorkEnd),
      date,
      timezone,
      duration + travelBuffer,
      slotInterval,
    );
  }

  return availableSlots;
}
