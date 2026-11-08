/**
 * Resource Assignment Utilities
 * Handles resource assignment to bookings and conflict checking
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ResourceRequirement {
  resource_id: string;
  required: boolean; // If false, resource is optional
}

export interface ResourceAssignment {
  booking_id: string;
  booking_service_id?: string;
  resource_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
}

/**
 * Check if resources are available for a time slot
 */
export async function checkResourceAvailability(
  supabase: SupabaseClient,
  resourceIds: string[],
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
  excludeGroupBookingId?: string,
): Promise<{ available: boolean; conflicts: Array<{ resource_id: string; reason: string }> }> {
  if (resourceIds.length === 0) {
    return { available: true, conflicts: [] };
  }

  const conflicts: Array<{ resource_id: string; reason: string }> = [];

  // Check each resource
  for (const resourceId of resourceIds) {
    // Get resource capacity
    const { data: resource } = await supabase
      .from('resources')
      .select('id, capacity')
      .eq('id', resourceId)
      .single();

    if (!resource) {
      conflicts.push({ resource_id: resourceId, reason: 'Resource not found' });
      continue;
    }

    // Count concurrent bookings for this resource, excluding cancelled/no-show
    // to match the SQL lock_booking_resources_for_update status filter
    const { data: existingBookings, error } = await supabase
      .from('booking_resources')
      .select('id, booking_id, bookings!inner(status, group_booking_id)')
      .eq('resource_id', resourceId)
      .lt('scheduled_start_at', endAt.toISOString())
      .gt('scheduled_end_at', startAt.toISOString())
      // Must mirror the canonical status filter in
      // `lock_booking_resources_for_update` (migration 475) so availability
      // checks and the DB-level lock agree on which bookings still occupy the
      // slot. NOTE: 'failed' is NOT a `booking_status` enum value — including it
      // as a literal raises 22P02 against the enum column (see migration 475),
      // so the filter must list only cancelled + no_show.
      .not('bookings.status', 'in', '("cancelled","no_show")')
      .neq('booking_id', excludeBookingId || '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('Error checking resource availability:', error);
      conflicts.push({ resource_id: resourceId, reason: 'Error checking availability' });
      continue;
    }

    const occupiedRows = (existingBookings ?? []).filter((row) => {
      const booking = (row as { bookings?: { group_booking_id?: string | null } }).bookings;
      if (
        excludeGroupBookingId &&
        booking?.group_booking_id &&
        String(booking.group_booking_id) === excludeGroupBookingId
      ) {
        return false;
      }
      return true;
    });

    // Check if at capacity
    const concurrentCount = occupiedRows.length;
    if (concurrentCount >= resource.capacity) {
      conflicts.push({ resource_id: resourceId, reason: `Resource at capacity (${resource.capacity})` });
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
  assignments: ResourceAssignment[]
): Promise<void> {
  if (assignments.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('booking_resources')
    .insert(assignments);

  if (error) {
    throw new Error(`Failed to assign resources: ${error.message}`);
  }
}

export interface OfferingResourceLink {
  offering_id: string;
  resource_id: string;
  required: boolean;
}

/**
 * Required + optional resource links for the given offerings, limited to
 * active resources (matching the public resource list customers pick from).
 *
 * Pass a service-role client: the public RLS policy on `offering_resources`
 * hides links for inactive offerings, which would silently drop requirements.
 */
export async function getActiveOfferingResourceLinks(
  supabase: SupabaseClient,
  offeringIds: string[]
): Promise<OfferingResourceLink[]> {
  const ids = [...new Set(offeringIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('offering_resources')
    .select('offering_id, resource_id, required, resources!inner(is_active)')
    .in('offering_id', ids)
    .eq('resources.is_active', true);

  if (error) {
    if (error.code === '42P01') {
      return [];
    }
    console.error('Error loading offering resources:', error);
    return [];
  }

  return ((data ?? []) as Array<{ offering_id: string; resource_id: string; required: boolean }>).map(
    (row) => ({
      offering_id: row.offering_id,
      resource_id: row.resource_id,
      required: row.required === true,
    })
  );
}

/**
 * Resources a booking must hold: every required link, plus customer-selected
 * resources that are actually linked to one of the booked offerings.
 * Unlinked ids are dropped so a client cannot reserve arbitrary resources.
 */
export function resolveBookingResourceIds(
  links: OfferingResourceLink[],
  selectedResourceIds?: string[] | null
): string[] {
  const linked = new Set(links.map((l) => l.resource_id));
  const required = links.filter((l) => l.required).map((l) => l.resource_id);
  const selected = (selectedResourceIds ?? []).filter(
    (id) => typeof id === 'string' && linked.has(id)
  );
  return [...new Set([...required, ...selected])];
}

/**
 * Get required (active) resources for an offering
 */
export async function getRequiredResourcesForOffering(
  supabase: SupabaseClient,
  offeringId: string
): Promise<string[]> {
  const links = await getActiveOfferingResourceLinks(supabase, [offeringId]);
  return links.filter((l) => l.required).map((l) => l.resource_id);
}
