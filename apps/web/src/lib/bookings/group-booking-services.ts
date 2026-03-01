/**
 * Group Booking Services Integration
 * Creates booking_services for each participant in a group booking
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface GroupParticipantService {
  participantId: string;
  participantName: string;
  serviceIds: string[];
  offeringId: string;
  staffId: string | null;
  durationMinutes: number;
  price: number;
  currency: string;
}

/**
 * Create booking_services for all participants in a group booking
 * Each participant gets their own booking_services entries
 */
export async function createGroupBookingServices(
  supabase: SupabaseClient,
  bookingId: string,
  scheduledStartAt: Date,
  participants: Array<{
    id: string;
    name: string;
    serviceIds: string[];
  }>,
  servicesMap: Map<string, {
    offering_id: string;
    staff_id: string | null;
    duration_minutes: number;
    price: number;
    currency: string;
  }>
): Promise<void> {
  const bookingServicesData: Array<{
    booking_id: string;
    offering_id: string;
    staff_id: string | null;
    duration_minutes: number;
    price: number;
    currency: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
    guest_name?: string | null;
  }> = [];

  // All participants share the same start time; each participant's services are sequential per person
  const baseCursor = new Date(scheduledStartAt);

  for (const participant of participants) {
    let participantCursor = new Date(baseCursor);

    for (const serviceId of participant.serviceIds) {
      const service = servicesMap.get(serviceId);
      if (!service) continue;

      const start = new Date(participantCursor);
      const end = new Date(start.getTime() + service.duration_minutes * 60000);

      bookingServicesData.push({
        booking_id: bookingId,
        offering_id: service.offering_id,
        staff_id: service.staff_id,
        duration_minutes: service.duration_minutes,
        price: service.price,
        currency: service.currency,
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
        guest_name: participant.name || null,
      });

      participantCursor = new Date(end);
    }
  }

  // Insert all booking_services
  if (bookingServicesData.length > 0) {
    const { error } = await supabase
      .from('booking_services')
      .insert(bookingServicesData);

    if (error) {
      throw new Error(`Failed to create group booking services: ${error.message}`);
    }
  }
}

/**
 * Calculate total duration for a group booking
 * Takes the maximum duration across all participants (since they run concurrently)
 */
export function calculateGroupBookingDuration(
  participants: Array<{ serviceIds: string[] }>,
  servicesMap: Map<string, { duration_minutes: number }>
): number {
  let maxDuration = 0;

  for (const participant of participants) {
    let participantDuration = 0;
    for (const serviceId of participant.serviceIds) {
      const service = servicesMap.get(serviceId);
      if (service) {
        participantDuration += service.duration_minutes;
      }
    }
    maxDuration = Math.max(maxDuration, participantDuration);
  }

  return maxDuration;
}

/**
 * Calculate total price for a group booking
 * Sums all services across all participants
 */
export function calculateGroupBookingPrice(
  participants: Array<{ serviceIds: string[] }>,
  servicesMap: Map<string, { price: number }>
): number {
  let total = 0;

  for (const participant of participants) {
    for (const serviceId of participant.serviceIds) {
      const service = servicesMap.get(serviceId);
      if (service) {
        total += service.price;
      }
    }
  }

  return total;
}
