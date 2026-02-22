/**
 * Resource Availability Utilities
 * Functions for checking resource conflicts and availability
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface Resource {
  id: string;
  provider_id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  capacity: number;
  is_active: boolean;
}

export interface ResourceConflict {
  resourceId: string;
  resourceName: string;
  conflictingBookingId: string;
  conflictingTime: {
    start: string;
    end: string;
  };
}

/**
 * Check if resources are available for a time slot
 */
export async function checkResourceAvailability(
  supabase: SupabaseClient,
  resourceIds: string[],
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string
): Promise<{ available: boolean; conflicts: ResourceConflict[] }> {
  if (resourceIds.length === 0) {
    return { available: true, conflicts: [] };
  }

  const conflicts: ResourceConflict[] = [];

  // Check each resource for conflicts
  for (const resourceId of resourceIds) {
    // Use RPC function if available, otherwise query directly
    const { data: isAvailable, error: rpcError } = await supabase.rpc(
      'check_resource_availability',
      {
        p_resource_id: resourceId,
        p_start_at: startAt.toISOString(),
        p_end_at: endAt.toISOString(),
        p_exclude_booking_id: excludeBookingId || null,
      }
    );

    if (!rpcError && isAvailable === false) {
      // Resource is not available, get conflict details
      const { data: conflictsData } = await supabase
        .from('booking_resources')
        .select(`
          booking_id,
          scheduled_start_at,
          scheduled_end_at,
          resources!inner (
            id,
            name
          )
        `)
        .eq('resource_id', resourceId)
        .lt('scheduled_start_at', endAt.toISOString())
        .gt('scheduled_end_at', startAt.toISOString())
        .neq('booking_id', excludeBookingId || '');

      if (conflictsData && conflictsData.length > 0) {
        for (const conflict of conflictsData) {
          conflicts.push({
            resourceId: resourceId,
            resourceName: (conflict.resources as any)?.name || 'Unknown',
            conflictingBookingId: conflict.booking_id,
            conflictingTime: {
              start: conflict.scheduled_start_at,
              end: conflict.scheduled_end_at,
            },
          });
        }
      }
    } else if (rpcError) {
      // Fallback: query directly if RPC doesn't exist
      const { data: conflictsData } = await supabase
        .from('booking_resources')
        .select(`
          booking_id,
          scheduled_start_at,
          scheduled_end_at,
          resources!inner (
            id,
            name
          ),
          bookings!inner (
            status
          )
        `)
        .eq('resource_id', resourceId)
        .lt('scheduled_start_at', endAt.toISOString())
        .gt('scheduled_end_at', startAt.toISOString())
        .neq('bookings.status', 'cancelled');

      if (excludeBookingId) {
        // Filter out the booking we're checking for (for reschedule scenarios)
        // This would need to be done in the query or after
      }

      if (conflictsData && conflictsData.length > 0) {
        for (const conflict of conflictsData) {
          if (excludeBookingId && conflict.booking_id === excludeBookingId) {
            continue; // Skip if it's the same booking
          }

          conflicts.push({
            resourceId: resourceId,
            resourceName: (conflict.resources as any)?.name || 'Unknown',
            conflictingBookingId: conflict.booking_id,
            conflictingTime: {
              start: conflict.scheduled_start_at,
              end: conflict.scheduled_end_at,
            },
          });
        }
      }
    }
  }

  return {
    available: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Assign resources to a booking
 */
export async function assignResourcesToBooking(
  supabase: SupabaseClient,
  bookingId: string,
  bookingServiceId: string | null,
  resourceIds: string[],
  startAt: Date,
  endAt: Date
): Promise<void> {
  if (resourceIds.length === 0) {
    return;
  }

  const resourceAssignments = resourceIds.map((resourceId) => ({
    booking_id: bookingId,
    booking_service_id: bookingServiceId,
    resource_id: resourceId,
    scheduled_start_at: startAt.toISOString(),
    scheduled_end_at: endAt.toISOString(),
  }));

  const { error } = await supabase
    .from('booking_resources')
    .insert(resourceAssignments);

  if (error) {
    throw error;
  }
}
