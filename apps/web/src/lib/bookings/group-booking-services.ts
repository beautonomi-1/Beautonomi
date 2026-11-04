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
 * Calculate total duration for a group booking
 * Takes the maximum duration across all participants (since they run concurrently)
 */
export function calculateGroupBookingDuration(
  participants: Array<{ serviceIds: string[] }>,
  servicesMap: Map<string, { duration_minutes: number; buffer_minutes?: number }>
): number {
  let maxDuration = 0;

  for (const participant of participants) {
    let participantDuration = 0;
    for (const serviceId of participant.serviceIds) {
      const service = servicesMap.get(serviceId);
      if (service) {
        participantDuration +=
          service.duration_minutes + Number(service.buffer_minutes ?? 0);
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
