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
  date: string
): boolean {
  const blockStart = combineDateAndTime(date, timeBlock.start_time);
  const blockEnd = combineDateAndTime(date, timeBlock.end_time);
  return timeRangesOverlap(slotStart, slotEnd, blockStart, blockEnd);
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
  _date: string
): TimeSlot[] {
  if (existingBookings.length === 0) {
    // No appointments: only show start and end of day slots
    const startSlot = slots.find((s) => s.time === workStart);
    const endSlot = slots.find((s) => {
      const slotMinutes = timeToMinutes(s.time);
      const endMinutes = timeToMinutes(workEnd);
      // Find last slot that fits before work end
      return slotMinutes < endMinutes && slotMinutes + 60 >= endMinutes;
    });

    return slots.filter((s) => s === startSlot || s === endSlot);
  }

  // Has appointments: only show slots adjacent to existing appointments
  const adjacentSlots = new Set<string>();

  // Slots before each appointment
  existingBookings.forEach((booking) => {
    const bookingStart = new Date(booking.scheduled_start_at);
    const bookingStartMinutes = bookingStart.getHours() * 60 + bookingStart.getMinutes();
    
    // Find slot 15 minutes before appointment
    const beforeSlot = slots.find((s) => {
      const slotMinutes = timeToMinutes(s.time);
      return slotMinutes === bookingStartMinutes - 15;
    });
    if (beforeSlot) {
      adjacentSlots.add(beforeSlot.time);
    }
  });

  // Slots after each appointment
  existingBookings.forEach((booking) => {
    const bookingEnd = new Date(booking.scheduled_end_at);
    const bufferMinutes = booking.buffer_minutes || 0;
    const totalEndMinutes = bookingEnd.getHours() * 60 + bookingEnd.getMinutes() + bufferMinutes;
    
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
  } = {}
): TimeSlot[] {
  const { staffShifts, timeBlocks, existingBookings, workHoursEnabled = true } = constraints;
  const { slotInterval = 15, avoidGaps = false, travelBuffer = 0 } = options;

  // If work hours are disabled, staff is available all day (subject to bookings and time blocks)
  if (!workHoursEnabled) {
    // Default to business hours (9 AM to 6 PM) when work hours are disabled
    const workStart = "09:00";
    const workEnd = "18:00";
    
    // Generate all possible slots for the day
    const allSlots = generateTimeSlots(workStart, workEnd, slotInterval);

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

      // Check if slot extends beyond default hours
      const workEndMinutes = timeToMinutes(workEnd);
      if (slotEndMinutes > workEndMinutes) {
        return {
          time: slotTime,
          available: false,
          reason: 'Extends beyond default hours',
        };
      }

      // Convert to Date objects for overlap checking
      const slotStart = combineDateAndTime(date, slotTime);
      const slotEnd = combineDateAndTime(date, minutesToTime(slotEndMinutes));

      // Check overlap with blocked segments
      if (slotOverlapsBlockedSegments(slotStart, slotEnd, blockedSegments)) {
        return {
          time: slotTime,
          available: false,
          reason: 'Conflicts with existing booking',
        };
      }

      // Check overlap with time blocks (still respect time blocks even if work hours disabled)
      const overlapsBlock = timeBlocks.some((block) =>
        slotOverlapsTimeBlock(slotStart, slotEnd, block, date)
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
      return applyGapAvoidance(availableSlots, existingBookings, workStart, workEnd, date);
    }

    return availableSlots;
  }

  // If work hours are enabled but no shifts, return empty
  if (staffShifts.length === 0) {
    return [];
  }

  // For now, use the first shift (could be enhanced to handle multiple shifts per day)
  const shift = staffShifts[0];
  const workStart = shift.start_time.substring(0, 5); // HH:MM
  const workEnd = shift.end_time.substring(0, 5); // HH:MM

  // Generate all possible slots
  const allSlots = generateTimeSlots(workStart, workEnd, slotInterval);

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

    // Check if slot extends beyond work hours
    const workEndMinutes = timeToMinutes(workEnd);
    if (slotEndMinutes > workEndMinutes) {
      return {
        time: slotTime,
        available: false,
        reason: 'Extends beyond work hours',
      };
    }

    // Convert to Date objects for overlap checking
    const slotStart = combineDateAndTime(date, slotTime);
    const slotEnd = combineDateAndTime(date, minutesToTime(slotEndMinutes));

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
      slotOverlapsTimeBlock(slotStart, slotEnd, block, date)
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
    return applyGapAvoidance(availableSlots, existingBookings, workStart, workEnd, date);
  }

  // Filter to only available slots (or show all with availability flag)
  return availableSlots;
}
