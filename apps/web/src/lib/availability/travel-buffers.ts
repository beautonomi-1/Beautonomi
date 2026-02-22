/**
 * Travel Time Buffer Calculation
 * Calculates travel time between consecutive at-home appointments
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface TravelTimeResult {
  distanceKm: number;
  estimatedMinutes: number;
  bufferMinutes: number; // ETA + 15 minutes safety margin
}

/**
 * Calculate travel time between two locations
 */
export async function calculateTravelTime(
  supabase: SupabaseClient,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<TravelTimeResult> {
  try {
    // Use Mapbox distance API
    const response = await fetch(
      `/api/mapbox/distance?from=${fromLat},${fromLng}&to=${toLat},${toLng}`
    );

    if (!response.ok) {
      throw new Error('Failed to calculate travel time');
    }

    const data = await response.json();
    const distanceKm = data.distance || 0;
    const durationSeconds = data.duration || 0;
    const estimatedMinutes = Math.ceil(durationSeconds / 60);

    // Add 15 minutes safety margin
    const bufferMinutes = estimatedMinutes + 15;

    return {
      distanceKm,
      estimatedMinutes,
      bufferMinutes,
    };
  } catch (error) {
    console.error('Error calculating travel time:', error);
    // Fallback: estimate based on distance (assume 50 km/h average speed)
    const distanceKm = calculateHaversineDistance(fromLat, fromLng, toLat, toLng);
    const estimatedMinutes = Math.ceil((distanceKm / 50) * 60);
    const bufferMinutes = estimatedMinutes + 15;

    return {
      distanceKm,
      estimatedMinutes,
      bufferMinutes,
    };
  }
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
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
