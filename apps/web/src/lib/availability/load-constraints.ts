/**
 * Load Availability Constraints
 * Queries database for staff shifts, time blocks, and existing bookings
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  StaffShift,
  TimeBlock,
  BookingService,
  AvailabilityConstraints,
} from './types';
import { expandRecurringPattern } from './time-utils';

/**
 * Check if staff member has work hours enabled
 */
export async function checkWorkHoursEnabled(
  supabase: SupabaseClient,
  staffId: string | null
): Promise<boolean> {
  if (!staffId) {
    return false;
  }

  const { data: staffData, error } = await supabase
    .from('provider_staff')
    .select('work_hours_enabled')
    .eq('id', staffId)
    .single();

  if (error || !staffData) {
    // Default to true if we can't determine (backward compatibility)
    return true;
  }

  return staffData.work_hours_enabled ?? true;
}

/**
 * Load staff shifts for a given staff member and date
 * Returns empty array if work_hours_enabled is false
 */
export async function loadStaffShifts(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string
): Promise<StaffShift[]> {
  if (!staffId) {
    return [];
  }

  // Check if work hours are enabled for this staff member
  const workHoursEnabled = await checkWorkHoursEnabled(supabase, staffId);
  
  // If work hours are disabled, return empty array (staff is not constrained by shifts)
  if (!workHoursEnabled) {
    return [];
  }

  // Query shifts for the specific date
  const { data: shifts, error } = await supabase
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', staffId)
    .eq('date', date);

  if (error) {
    console.error('Error loading staff shifts:', error);
    return [];
  }

  if (!shifts) {
    return [];
  }

  // Also check for recurring shifts
  const { data: recurringShifts, error: recurringError } = await supabase
    .from('staff_shifts')
    .select('*')
    .eq('staff_id', staffId)
    .eq('is_recurring', true);

  if (!recurringError && recurringShifts) {
    const expandedRecurring = recurringShifts
      .filter((shift) => {
        if (!shift.recurring_pattern) return false;
        return expandRecurringPattern(
          shift.recurring_pattern as any,
          shift.date,
          date
        );
      })
      .map((shift) => ({
        ...shift,
        date, // Override date with target date
        is_recurring: false, // Mark as expanded
      }));

    return [...(shifts || []), ...expandedRecurring] as StaffShift[];
  }

  return (shifts || []) as StaffShift[];
}

/**
 * Load time blocks for a given staff member and date
 */
export async function loadTimeBlocks(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string
): Promise<TimeBlock[]> {
  // Query time blocks for the specific date
  // staff_id = null means applies to all staff
  const query = supabase
    .from('time_blocks')
    .select('*')
    .eq('date', date)
    .eq('is_active', true);

  if (staffId) {
    query.or(`staff_id.eq.${staffId},staff_id.is.null`);
  } else {
    query.is('staff_id', null);
  }

  const { data: blocks, error } = await query;

  if (error) {
    console.error('Error loading time blocks:', error);
    return [];
  }

  if (!blocks) {
    return [];
  }

  // Also check for recurring blocks
  const recurringQuery = supabase
    .from('time_blocks')
    .select('*')
    .eq('is_recurring', true)
    .eq('is_active', true);

  if (staffId) {
    recurringQuery.or(`staff_id.eq.${staffId},staff_id.is.null`);
  } else {
    recurringQuery.is('staff_id', null);
  }

  const { data: recurringBlocks, error: recurringError } = await recurringQuery;

  if (!recurringError && recurringBlocks) {
    const expandedRecurring = recurringBlocks
      .filter((block) => {
        if (!block.recurring_pattern) return false;
        return expandRecurringPattern(
          block.recurring_pattern as any,
          block.date,
          date
        );
      })
      .map((block) => ({
        ...block,
        date, // Override date with target date
        is_recurring: false, // Mark as expanded
      }));

    return [...(blocks || []), ...expandedRecurring] as TimeBlock[];
  }

  return (blocks || []) as TimeBlock[];
}

/**
 * Load existing bookings for a given staff member and date
 * Includes buffer_minutes, processing_minutes, finishing_minutes from offerings table
 * Applies staff overrides if they exist
 */
export async function loadExistingBookings(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string
): Promise<BookingService[]> {
  if (!staffId) {
    return [];
  }

  // Load staff overrides first
  const { data: staffData } = await supabase
    .from('provider_staff')
    .select('buffer_minutes_override, processing_minutes_override, finishing_minutes_override')
    .eq('id', staffId)
    .single();

  // Query booking_services for the date
  // Join with bookings to filter by status
  // Join with offerings to get buffer_minutes
  const { data: bookingServices, error } = await supabase
    .from('booking_services')
    .select(`
      id,
      booking_id,
      offering_id,
      staff_id,
      scheduled_start_at,
      scheduled_end_at,
      duration_minutes,
      bookings!inner (
        id,
        status
      ),
      offerings!inner (
        buffer_minutes,
        processing_minutes,
        finishing_minutes
      )
    `)
    .eq('staff_id', staffId)
    .gte('scheduled_start_at', `${date}T00:00:00`)
    .lt('scheduled_start_at', `${date}T23:59:59`)
    .neq('bookings.status', 'cancelled');

  if (error) {
    console.error('Error loading existing bookings:', error);
    return [];
  }

  if (!bookingServices) {
    return [];
  }

  // Transform to BookingService format, applying staff overrides
  return bookingServices
    .filter((bs: any) => {
      // Filter out cancelled bookings (should be handled by query but double-check)
      return bs.bookings?.status !== 'cancelled';
    })
    .map((bs: any) => {
      // Apply staff overrides if they exist, otherwise use service defaults
      const bufferMinutes = staffData?.buffer_minutes_override ?? bs.offerings?.buffer_minutes ?? 15;
      const processingMinutes = staffData?.processing_minutes_override ?? bs.offerings?.processing_minutes ?? 0;
      const finishingMinutes = staffData?.finishing_minutes_override ?? bs.offerings?.finishing_minutes ?? 0;

      return {
        id: bs.id,
        booking_id: bs.booking_id,
        offering_id: bs.offering_id,
        staff_id: bs.staff_id,
        scheduled_start_at: bs.scheduled_start_at,
        scheduled_end_at: bs.scheduled_end_at,
        duration_minutes: bs.duration_minutes,
        buffer_minutes: bufferMinutes,
        processing_minutes: processingMinutes,
        finishing_minutes: finishingMinutes,
      };
    }) as BookingService[];
}

/**
 * Load provider settings (gap avoidance, etc.)
 */
export async function loadProviderSettings(
  supabase: SupabaseClient,
  providerId: string
): Promise<{ avoidGaps: boolean; allowDoubleBookingManual: boolean }> {
  const { data: settings } = await supabase
    .from('provider_settings')
    .select('avoid_gaps, allow_double_booking_manual')
    .eq('provider_id', providerId)
    .single();

  return {
    avoidGaps: settings?.avoid_gaps ?? false,
    allowDoubleBookingManual: settings?.allow_double_booking_manual ?? false,
  };
}

/**
 * Load all constraints for availability calculation
 */
export async function loadAvailabilityConstraints(
  supabase: SupabaseClient,
  staffId: string | null,
  date: string,
  providerId?: string
): Promise<AvailabilityConstraints & { 
  providerSettings?: { avoidGaps: boolean; allowDoubleBookingManual: boolean };
  workHoursEnabled?: boolean;
}> {
  // Check work hours enabled first (needed for conditional loading)
  const workHoursEnabled = staffId ? await checkWorkHoursEnabled(supabase, staffId) : false;

  const [staffShifts, timeBlocks, existingBookings, providerSettings] = await Promise.all([
    loadStaffShifts(supabase, staffId, date),
    // Only load time blocks if work hours are enabled (time blocks are part of schedule management)
    workHoursEnabled ? loadTimeBlocks(supabase, staffId, date) : Promise.resolve([]),
    loadExistingBookings(supabase, staffId, date),
    providerId ? loadProviderSettings(supabase, providerId) : Promise.resolve(undefined),
  ]);

  return {
    staffShifts,
    timeBlocks,
    existingBookings,
    providerSettings,
    workHoursEnabled,
  } as AvailabilityConstraints & { 
    providerSettings?: { avoidGaps: boolean; allowDoubleBookingManual: boolean };
    workHoursEnabled?: boolean;
  };
}
