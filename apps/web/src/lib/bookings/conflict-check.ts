/**
 * Booking Conflict Detection
 * Checks for time overlaps before creating bookings
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingBookings?: Array<{
    booking_id: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
  }>;
}

/**
 * Check if a booking time slot conflicts with existing bookings
 * Includes buffer time in the conflict check
 */
export async function checkBookingConflict(
  supabase: SupabaseClient,
  staffId: string,
  startAt: Date,
  endAt: Date,
  bufferMinutes: number = 15
): Promise<ConflictCheckResult> {
  // Calculate effective end time (including buffer)
  const effectiveEndAt = new Date(endAt.getTime() + bufferMinutes * 60000);

  // Query for overlapping bookings
  // We check if the new booking overlaps with any existing booking
  // Overlap occurs if: new_start < existing_end AND new_end > existing_start
  const { data: conflictingServices, error } = await supabase
    .from('booking_services')
    .select(`
      booking_id,
      scheduled_start_at,
      scheduled_end_at,
      bookings!inner (
        id,
        status
      ),
      offerings!inner (
        buffer_minutes
      )
    `)
    .eq('staff_id', staffId)
    .neq('bookings.status', 'cancelled')
    .lt('scheduled_start_at', effectiveEndAt.toISOString())
    .gt('scheduled_end_at', startAt.toISOString());

  if (error) {
    console.error('Error checking booking conflict:', error);
    // On error, assume conflict exists (fail-safe)
    return { hasConflict: true };
  }

  if (!conflictingServices || conflictingServices.length === 0) {
    return { hasConflict: false };
  }

  // Check if conflicts account for their own buffers
  // For each conflicting booking, add its buffer to the end time
  const actualConflicts = conflictingServices.filter((cs: any) => {
    const conflictStart = new Date(cs.scheduled_start_at);
    const conflictEnd = new Date(cs.scheduled_end_at);
    const conflictBuffer = cs.offerings?.buffer_minutes || 15;
    const conflictEffectiveEnd = new Date(conflictEnd.getTime() + conflictBuffer * 60000);

    // Check if there's actual overlap
    return startAt < conflictEffectiveEnd && effectiveEndAt > conflictStart;
  });

  if (actualConflicts.length === 0) {
    return { hasConflict: false };
  }

  return {
    hasConflict: true,
    conflictingBookings: actualConflicts.map((cs: any) => ({
      booking_id: cs.booking_id,
      scheduled_start_at: cs.scheduled_start_at,
      scheduled_end_at: cs.scheduled_end_at,
    })),
  };
}

/**
 * Lock booking services for a time range (for transaction)
 * Uses SELECT FOR UPDATE to prevent concurrent modifications
 * Returns a lock key that should be released after booking creation
 */
export async function lockBookingServices(
  supabase: SupabaseClient,
  staffId: string,
  startAt: Date,
  endAt: Date,
  bufferMinutes: number = 15
): Promise<{ hasConflict: boolean; conflictingBookings?: any[]; lockKey?: number }> {
  const effectiveEndAt = new Date(endAt.getTime() + bufferMinutes * 60000);

  // Generate a unique advisory lock key based on staff_id and time range
  // This ensures we can hold the lock across multiple operations
  const lockKey = generateAdvisoryLockKey(staffId, startAt, effectiveEndAt);

  // Acquire advisory lock (this will block other concurrent requests)
  // Note: Advisory locks are automatically released at transaction end
  // Since Supabase doesn't support transactions, we use a session-level lock
  const { data: _lockAcquired, error: lockError } = await supabase.rpc('acquire_booking_lock', {
    p_key: lockKey,
  });

  if (lockError) {
    // If advisory lock function doesn't exist, fall back to SELECT FOR UPDATE only
    console.warn('Advisory lock not available, using SELECT FOR UPDATE only');
  }

  // Use RPC function for SELECT FOR UPDATE (within the advisory lock)
  const { data: lockedRows, error } = await supabase.rpc('lock_booking_services_for_update', {
    p_staff_id: staffId,
    p_start_at: startAt.toISOString(),
    p_end_at: effectiveEndAt.toISOString(),
  });

  // If RPC doesn't exist, fall back to regular conflict check
  if (error && (error.message.includes('function') || error.message.includes('does not exist'))) {
    // Fallback to regular check
    return await checkBookingConflict(supabase, staffId, startAt, endAt, bufferMinutes);
  }

  if (error) {
    console.error('Error locking booking services:', error);
    throw error;
  }

  // If rows were returned, there's a conflict
  if (lockedRows && lockedRows.length > 0) {
    return {
      hasConflict: true,
      conflictingBookings: lockedRows,
      lockKey: lockKey,
    };
  }

  return { hasConflict: false, lockKey: lockKey };
}

/**
 * Generate a unique advisory lock key from staff_id and time range
 * Uses a hash function to create a consistent integer key
 */
function generateAdvisoryLockKey(staffId: string, startAt: Date, endAt: Date): number {
  // Create a hash from staff_id and time range
  // PostgreSQL advisory locks use bigint, but we'll use a 32-bit hash
  const hashString = `${staffId}-${startAt.getTime()}-${endAt.getTime()}`;
  let hash = 0;
  for (let i = 0; i < hashString.length; i++) {
    const char = hashString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Use absolute value and ensure it's within PostgreSQL's bigint range
  return Math.abs(hash);
}

/**
 * Check if manual double booking override is allowed
 */
export async function canOverrideDoubleBooking(
  supabase: SupabaseClient,
  providerId: string
): Promise<boolean> {
  const { data: settings } = await supabase
    .from('provider_settings')
    .select('allow_double_booking_manual')
    .eq('provider_id', providerId)
    .single();

  return settings?.allow_double_booking_manual ?? false;
}
