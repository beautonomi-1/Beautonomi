/**
 * Resource Availability Utilities
 * Functions for checking resource conflicts and availability
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  assignResourcesToBooking as assignResourceAssignments,
  checkResourceAvailability as checkAssignedResourceAvailability,
} from "@/lib/resources/assignment";

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
 *
 * @deprecated Use `@/lib/resources/assignment`. This shim exists only for
 * older imports and delegates to the canonical capacity-aware implementation.
 */
export async function checkResourceAvailability(
  supabase: SupabaseClient,
  resourceIds: string[],
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string
): Promise<{ available: boolean; conflicts: ResourceConflict[] }> {
  const result = await checkAssignedResourceAvailability(
    supabase,
    resourceIds,
    startAt,
    endAt,
    excludeBookingId,
  );
  return {
    available: result.available,
    conflicts: result.conflicts.map((conflict) => ({
      resourceId: conflict.resource_id,
      resourceName: conflict.resource_id,
      conflictingBookingId: "",
      conflictingTime: {
        start: startAt.toISOString(),
        end: endAt.toISOString(),
      },
    })),
  };
}

/**
 * Assign resources to a booking
 *
 * @deprecated Use `@/lib/resources/assignment`.
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

  await assignResourceAssignments(supabase, resourceIds.map((resourceId) => ({
    booking_id: bookingId,
    ...(bookingServiceId ? { booking_service_id: bookingServiceId } : {}),
    resource_id: resourceId,
    scheduled_start_at: startAt.toISOString(),
    scheduled_end_at: endAt.toISOString(),
  })));
}
