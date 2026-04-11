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
 * Check if a booking time slot conflicts with existing bookings (staff-scoped).
 *
 * `endAt` + `bufferMinutes` together define the **blocking** window. Passing the default
 * `bufferMinutes` (15) is correct when `endAt` is the **end of the last service segment**
 * (scheduled end), not including turnover yet.
 *
 * When `endAt` **already** includes the trailing turnover buffer (e.g. summed per-service
 * buffers in validate-booking, `booking_holds.end_at`, or provider POST `endAt`), pass
 * **`bufferMinutes: 0`** — otherwise the buffer is applied twice and the next slot can
 * falsely conflict (409).
 *
 * @param excludeBookingId - When set (e.g. for reschedule), ignore this booking's rows.
 */
export async function checkBookingConflict(
  supabase: SupabaseClient,
  staffId: string,
  startAt: Date,
  endAt: Date,
  bufferMinutes: number = 15,
  excludeBookingId?: string
): Promise<ConflictCheckResult> {
  const effectiveEndAt = new Date(endAt.getTime() + bufferMinutes * 60000);

  // Query for overlapping bookings
  // We check if the new booking overlaps with any existing booking
  // Overlap occurs if: new_start < existing_end AND new_end > existing_start
  let query = supabase
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

  if (excludeBookingId) {
    query = query.neq('booking_id', excludeBookingId);
  }

  const { data: conflictingServices, error } = await query;

  if (error) {
    console.error('[conflict-check] checkBookingConflict DB error — treating as no conflict to avoid false 409:', error);
    // Return no conflict on transient DB errors: a false positive blocks legitimate
    // bookings permanently while a false negative is caught by the DB-level unique
    // constraint in create_booking_with_locking.
    return { hasConflict: false };
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

export type SnapshotLineForConflict = {
  offering_id: string;
  staff_id: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
};

/**
 * Validate each scheduled line against existing bookings: per-segment staff (or provider-wide when staff is null).
 * Use this for multi-service holds where different lines may reference different staff.
 */
export async function checkBookingSnapshotSegmentConflicts(
  supabase: SupabaseClient,
  providerId: string,
  snapshot: SnapshotLineForConflict[],
  offeringBufferMinutesById: Map<string, number>
): Promise<ConflictCheckResult> {
  for (const line of snapshot) {
    const segStart = new Date(line.scheduled_start_at);
    const segEnd = new Date(line.scheduled_end_at);
    const buf = offeringBufferMinutesById.get(line.offering_id) ?? 15;
    if (line.staff_id) {
      const r = await checkBookingConflict(
        supabase,
        line.staff_id,
        segStart,
        segEnd,
        buf
      );
      if (r.hasConflict) return r;
    } else {
      const r = await checkBookingConflictForProvider(
        supabase,
        providerId,
        segStart,
        segEnd,
        buf
      );
      if (r.hasConflict) return r;
    }
  }
  return { hasConflict: false };
}

/**
 * Solo / synthetic staff: any booking_services row under this provider that overlaps the window.
 */
export async function checkBookingConflictForProvider(
  supabase: SupabaseClient,
  providerId: string,
  startAt: Date,
  endAt: Date,
  bufferMinutes: number = 15,
  excludeBookingId?: string
): Promise<ConflictCheckResult> {
  const effectiveEndAt = new Date(endAt.getTime() + bufferMinutes * 60000);

  let query = supabase
    .from('booking_services')
    .select(`
      booking_id,
      scheduled_start_at,
      scheduled_end_at,
      bookings!inner (
        id,
        status,
        provider_id
      ),
      offerings!inner (
        buffer_minutes
      )
    `)
    .eq('bookings.provider_id', providerId)
    .neq('bookings.status', 'cancelled')
    .lt('scheduled_start_at', effectiveEndAt.toISOString())
    .gt('scheduled_end_at', startAt.toISOString());

  if (excludeBookingId) {
    query = query.neq('booking_id', excludeBookingId);
  }

  const { data: conflictingServices, error } = await query;

  if (error) {
    console.error('[conflict-check] checkBookingConflictForProvider DB error — treating as no conflict to avoid false 409:', error);
    return { hasConflict: false };
  }

  if (!conflictingServices || conflictingServices.length === 0) {
    return { hasConflict: false };
  }

  const actualConflicts = conflictingServices.filter((cs: any) => {
    const conflictStart = new Date(cs.scheduled_start_at);
    const conflictEnd = new Date(cs.scheduled_end_at);
    const conflictBuffer = cs.offerings?.buffer_minutes || 15;
    const conflictEffectiveEnd = new Date(conflictEnd.getTime() + conflictBuffer * 60000);

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
 * Advisory lock + `lock_booking_services_for_update` (or {@link checkBookingConflict} fallback).
 *
 * @param bufferMinutes - Extra slack after `endAt` (default 15). Use **0** when `endAt` already
 *   includes trailing turnover (hold end, validate-booking computed end, etc.) — same contract as {@link checkBookingConflict}.
 */
/**
 * True if another guest’s active hold overlaps [startAt, endAt) for this provider/staff.
 * When `dbStaffId` is null (e.g. synthetic solo staff), any hold on the provider overlaps.
 */
export async function checkActiveHoldOverlap(
  supabase: SupabaseClient,
  providerId: string,
  startAt: Date,
  endAt: Date,
  options: { dbStaffId: string | null; excludeHoldId?: string }
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  let q = supabase
    .from('booking_holds')
    .select('id')
    .eq('provider_id', providerId)
    .eq('hold_status', 'active')
    .gt('expires_at', nowIso)
    .lt('start_at', endAt.toISOString())
    .gt('end_at', startAt.toISOString());

  if (options.excludeHoldId) {
    q = q.neq('id', options.excludeHoldId);
  }

  if (options.dbStaffId) {
    q = q.or(`staff_id.eq.${options.dbStaffId},staff_id.is.null`);
  }

  const { data, error } = await q.limit(1);

  if (error) {
    console.error('[conflict-check] checkActiveHoldOverlap DB error — treating as no conflict to avoid false 409:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

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
    console.error('[conflict-check] lockBookingServices RPC error — falling back to regular conflict check:', error);
    return await checkBookingConflict(supabase, staffId, startAt, endAt, bufferMinutes);
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
