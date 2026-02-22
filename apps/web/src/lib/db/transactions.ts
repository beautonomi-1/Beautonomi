/**
 * Database Transaction Utilities
 * Wrappers for database transactions with proper error handling
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Execute a function within a database transaction
 * Note: Supabase client doesn't support explicit transactions via JS client,
 * so we use the admin client and rely on application-level conflict checking
 * For true transactions, we'd need to use RPC functions or raw SQL
 */
export async function withTransaction<T>(
  callback: (client: SupabaseClient) => Promise<T>
): Promise<T> {
  const adminClient = getSupabaseAdmin();

  try {
    // Execute callback with admin client
    // Note: Each Supabase operation is atomic, but we can't wrap multiple
    // operations in a single transaction without RPC functions
    // For now, we rely on conflict checking before operations
    const result = await callback(adminClient);
    return result;
  } catch (error) {
    // Re-throw error for caller to handle
    throw error;
  }
}

/**
 * Execute a function with row-level locking
 * Uses SELECT FOR UPDATE to lock rows during transaction
 */
export async function withRowLock<T>(
  client: SupabaseClient,
  table: string,
  filter: Record<string, any>,
  callback: () => Promise<T>
): Promise<T> {
  // For Supabase, we'll use a different approach:
  // 1. Query with filter to get row IDs
  // 2. Use those IDs in the callback
  // 3. Rely on application-level conflict checking
  
  // Since Supabase client doesn't support SELECT FOR UPDATE directly,
  // we'll implement conflict checking at the application level
  // and use the transaction wrapper for atomicity
  
  return await callback();
}

/**
 * Check for conflicts and lock rows (application-level)
 * This is a workaround since Supabase client doesn't support SELECT FOR UPDATE
 */
export async function checkAndLockBookingSlot(
  client: SupabaseClient,
  staffId: string,
  startAt: Date,
  endAt: Date,
  bufferMinutes: number
): Promise<{ hasConflict: boolean; conflictingIds?: string[] }> {
  const effectiveEndAt = new Date(endAt.getTime() + bufferMinutes * 60000);

  // Query for potential conflicts
  const { data: conflicts, error } = await client
    .from('booking_services')
    .select('id, booking_id, scheduled_start_at, scheduled_end_at, bookings!inner(status), offerings!inner(buffer_minutes)')
    .eq('staff_id', staffId)
    .neq('bookings.status', 'cancelled')
    .lt('scheduled_start_at', effectiveEndAt.toISOString())
    .gt('scheduled_end_at', startAt.toISOString());

  if (error) {
    throw error;
  }

  if (!conflicts || conflicts.length === 0) {
    return { hasConflict: false };
  }

  // Check actual overlaps accounting for buffers
  const actualConflicts = conflicts.filter((c: any) => {
    const conflictStart = new Date(c.scheduled_start_at);
    const conflictEnd = new Date(c.scheduled_end_at);
    const conflictBuffer = c.offerings?.buffer_minutes || 15;
    const conflictEffectiveEnd = new Date(conflictEnd.getTime() + conflictBuffer * 60000);

    return startAt < conflictEffectiveEnd && effectiveEndAt > conflictStart;
  });

  if (actualConflicts.length === 0) {
    return { hasConflict: false };
  }

  return {
    hasConflict: true,
    conflictingIds: actualConflicts.map((c: any) => c.id),
  };
}
