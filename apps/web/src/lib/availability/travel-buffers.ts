/**
 * Travel Time Buffer Calculation
 * Calculates travel time between consecutive at-home appointments.
 * Uses Mapbox Directions (driving) when available for accurate distance and duration; otherwise Haversine + 50 km/h.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { haversineDistanceKmFromCoords } from '@/lib/geo/distance';
import { getCachedDirections } from '@/lib/availability/directions-cache';

export interface TravelTimeResult {
  distanceKm: number;
  estimatedMinutes: number;
  bufferMinutes: number; // ETA + 15 minutes safety margin
}

const DIRECTIONS_PROFILE = 'driving';

/**
 * Calculate travel time between two locations.
 * Prefers Mapbox Directions (driving) for distance and duration; fallback is Haversine + 50 km/h.
 *
 * Directions results are cached for 24h by rounded coords (4 dp) + profile — Upstash when
 * configured, else in-memory LRU (see `directions-cache.ts`) — so repeated availability
 * checks for the same address pair do not re-bill Mapbox.
 */
export async function calculateTravelTime(
  _supabase: SupabaseClient,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<TravelTimeResult> {
  try {
    const route = await getCachedDirections(
      { fromLat, fromLng, toLat, toLng, profile: DIRECTIONS_PROFILE },
      async () => {
        const { getMapboxService } = await import('@/lib/mapbox/mapbox');
        const mapbox = await getMapboxService();
        const from = { latitude: fromLat, longitude: fromLng };
        const to = { latitude: toLat, longitude: toLng };
        const result = await mapbox.calculateRoute([from, to], {
          profile: DIRECTIONS_PROFILE,
          steps: false,
          overview: 'simplified',
        });
        return { distance: result.distance, duration: result.duration };
      },
    );
    const distanceKm = route.distance / 1000;
    const estimatedMinutes = Math.ceil(route.duration / 60);
    const bufferMinutes = estimatedMinutes + 15;
    return {
      distanceKm,
      estimatedMinutes,
      bufferMinutes,
    };
  } catch (error) {
    console.warn('Mapbox route failed, using Haversine + 50 km/h:', error);
  }

  const distanceKm = haversineDistanceKmFromCoords(fromLat, fromLng, toLat, toLng);
  const estimatedMinutes = Math.ceil((distanceKm / 50) * 60);
  const bufferMinutes = estimatedMinutes + 15;
  return {
    distanceKm,
    estimatedMinutes,
    bufferMinutes,
  };
}

/**
 * Get travel buffer for at-home booking based on previous booking
 */
export async function getTravelBufferForAtHomeBooking(
  supabase: SupabaseClient,
  staffId: string,
  bookingDate: Date,
  bookingLocation: { lat: number; lng: number }
): Promise<number> {
  const date = bookingDate.toISOString().split('T')[0];

  // Find previous at-home booking for same staff on same day
  const { data: previousBooking } = await supabase
    .from('booking_services')
    .select(`
      scheduled_end_at,
      bookings!inner (
        location_type,
        address_latitude,
        address_longitude
      )
    `)
    .eq('staff_id', staffId)
    .eq('bookings.location_type', 'at_home')
    .lt('scheduled_end_at', bookingDate.toISOString())
    .gte('scheduled_start_at', `${date}T00:00:00`)
    .order('scheduled_end_at', { ascending: false })
    .limit(1)
    .single();

  if (!previousBooking || !previousBooking.bookings) {
    return 0; // No previous booking, no travel buffer needed
  }

  const prevBooking = previousBooking.bookings as any;
  if (!prevBooking.address_latitude || !prevBooking.address_longitude) {
    return 0; // No location data for previous booking
  }

  // Calculate travel time
  const travelTime = await calculateTravelTime(
    supabase,
    prevBooking.address_latitude,
    prevBooking.address_longitude,
    bookingLocation.lat,
    bookingLocation.lng
  );

  return travelTime.bufferMinutes;
}
