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
  excludeBookingId?: string
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

    // Count concurrent bookings for this resource
    const { data: existingBookings, error } = await supabase
      .from('booking_resources')
      .select('id, booking_id')
      .eq('resource_id', resourceId)
      .lt('scheduled_start_at', endAt.toISOString())
      .gt('scheduled_end_at', startAt.toISOString())
      .neq('booking_id', excludeBookingId || '00000000-0000-0000-0000-000000000000'); // Exclude current booking if rescheduling

    if (error) {
      console.error('Error checking resource availability:', error);
      conflicts.push({ resource_id: resourceId, reason: 'Error checking availability' });
      continue;
    }

    // Check if at capacity
    const concurrentCount = existingBookings?.length || 0;
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

/**
 * Get required resources for an offering
 */
export async function getRequiredResourcesForOffering(
  supabase: SupabaseClient,
  offeringId: string
): Promise<string[]> {
  // Check if offering_resources table exists
  const { data: offeringResources, error } = await supabase
    .from('offering_resources')
    .select('resource_id, required')
    .eq('offering_id', offeringId);

  if (error) {
    // Table might not exist, return empty array
    if (error.code === '42P01') {
      return [];
    }
    console.error('Error loading required resources:', error);
    return [];
  }

  // Return only required resources
  return (offeringResources || [])
    .filter((or: any) => or.required === true)
    .map((or: any) => or.resource_id);
}
