/**
 * Travel Chaining Logic
 * 
 * Computes travel time between appointments based on their locations.
 * Handles route chaining where travel depends on previous/next appointment's location.
 * 
 * @module lib/scheduling/travelChaining
 */

import type { Appointment } from "@/lib/provider-portal/types";
import type { Coordinates } from "@/lib/travel/travelFeeEngine";
import { calculateDistance, type TravelFeeRules } from "@/lib/travel/travelFeeEngine";

// ============================================================================
// TYPES
// ============================================================================

export interface LocationInfo {
  type: "salon" | "home" | "unknown";
  coordinates?: Coordinates;
  address?: string;
  locationId?: string;
  locationName?: string;
}

export interface TravelSegment {
  fromAppointmentId: string | null;
  toAppointmentId: string;
  fromLocation: LocationInfo;
  toLocation: LocationInfo;
  travelTimeMinutes: number;
  distanceKm?: number;
  isOverridden: boolean;
  overrideReason?: string;
}

export interface ChainedTravelResult {
  appointmentId: string;
  preTravelMinutes: number;
  postTravelMinutes: number;
  preTravelSegment?: TravelSegment;
  postTravelSegment?: TravelSegment;
  totalTravelFee: number;
  isOverridden: boolean;
}

export interface TravelOverride {
  appointmentId: string;
  overrideTravelMinutes?: number;
  overrideTravelFee?: number;
  reason?: string;
  overriddenBy?: string;
  overriddenAt?: string;
}

// ============================================================================
// LOCATION EXTRACTION
// ============================================================================

/**
 * Extract location info from an appointment
 */
export function getAppointmentLocation(
  appointment: Appointment,
  salonLocations: Map<string, Coordinates>
): LocationInfo {
  // At-home appointments
  if (appointment.location_type === "at_home") {
    const coords = appointment.address_latitude && appointment.address_longitude
      ? { latitude: appointment.address_latitude, longitude: appointment.address_longitude }
      : undefined;
    
    const addressParts = [
      appointment.address_line1,
      appointment.address_line2,
      appointment.address_city,
      appointment.address_postal_code,
    ].filter(Boolean);
    
    return {
      type: "home",
      coordinates: coords,
      address: addressParts.join(", ") || undefined,
    };
  }
  
  // In-salon appointments
  if (appointment.location_id) {
    const coords = salonLocations.get(appointment.location_id);
    return {
      type: "salon",
      coordinates: coords,
      locationId: appointment.location_id,
      locationName: appointment.location_name,
    };
  }
  
  // Default to unknown
  return { type: "unknown" };
}

// ============================================================================
// TRAVEL CHAINING
// ============================================================================

/**
 * Compute travel time between two locations
 */
export function computeTravelBetweenLocations(
  from: LocationInfo,
  to: LocationInfo,
  rules?: Partial<TravelFeeRules>
): { travelTimeMinutes: number; distanceKm?: number } {
  const baseTravelTime = rules?.baseTravelTimeMinutes || 30;
  const minutesPerKm = rules?.defaultMinutesPerKm || 2;
  
  // If both locations have coordinates, calculate actual distance
  if (from.coordinates && to.coordinates) {
    const distanceKm = calculateDistance(from.coordinates, to.coordinates);
    const travelTimeMinutes = Math.max(
      baseTravelTime,
      Math.round(distanceKm * minutesPerKm)
    );
    return { travelTimeMinutes, distanceKm };
  }
  
  // Same salon location = no travel
  if (from.type === "salon" && to.type === "salon" && from.locationId === to.locationId) {
    return { travelTimeMinutes: 0 };
  }
  
  // Different locations without coordinates = use base travel time
  if (from.type !== to.type || (from.type === "home" && to.type === "home")) {
    return { travelTimeMinutes: baseTravelTime };
  }
  
  // Same type, no coordinates = assume same location
  return { travelTimeMinutes: 0 };
}

/**
 * Get all appointments for a staff member on a date, sorted by time
 */
export function getStaffDayAppointments(
  allAppointments: Appointment[],
  staffId: string,
  date: string
): Appointment[] {
  return allAppointments
    .filter(apt => apt.team_member_id === staffId && apt.scheduled_date === date)
    .filter(apt => apt.status !== "cancelled" && apt.status !== "no_show")
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
}

/**
 * Compute chained travel for all AT_HOME appointments on a day
 * 
 * Rules:
 * - If previous appointment is AT_HOME: travel starts from that address
 * - If previous appointment is IN_SALON/WALK_IN: travel starts from salon location
 * - If no previous appointment: travel starts from default salon location
 * - Same logic applies for return travel after appointment
 */
export function computeChainedTravel(
  appointments: Appointment[],
  salonLocations: Map<string, Coordinates>,
  defaultSalonId: string,
  overrides: Map<string, TravelOverride>,
  rules?: Partial<TravelFeeRules>
): ChainedTravelResult[] {
  const results: ChainedTravelResult[] = [];
  
  // Get default salon location
  const defaultSalonLocation: LocationInfo = {
    type: "salon",
    coordinates: salonLocations.get(defaultSalonId),
    locationId: defaultSalonId,
  };
  
  for (let i = 0; i < appointments.length; i++) {
    const current = appointments[i];
    
    // Only compute travel for AT_HOME appointments
    if (current.location_type !== "at_home") {
      continue;
    }
    
    const currentLocation = getAppointmentLocation(current, salonLocations);
    const override = overrides.get(current.id);
    
    // Determine previous location
    let prevLocation: LocationInfo;
    let prevAppointmentId: string | null = null;
    
    if (i > 0) {
      const prev = appointments[i - 1];
      prevLocation = getAppointmentLocation(prev, salonLocations);
      prevAppointmentId = prev.id;
    } else {
      prevLocation = defaultSalonLocation;
    }
    
    // Determine next location
    let nextLocation: LocationInfo;
    let nextAppointmentId: string | null = null;
    
    if (i < appointments.length - 1) {
      const next = appointments[i + 1];
      nextLocation = getAppointmentLocation(next, salonLocations);
      nextAppointmentId = next.id;
    } else {
      nextLocation = defaultSalonLocation;
    }
    
    // Compute pre-travel (from previous location to current)
    const preTravelResult = computeTravelBetweenLocations(prevLocation, currentLocation, rules);
    const preTravelSegment: TravelSegment = {
      fromAppointmentId: prevAppointmentId,
      toAppointmentId: current.id,
      fromLocation: prevLocation,
      toLocation: currentLocation,
      travelTimeMinutes: override?.overrideTravelMinutes ?? preTravelResult.travelTimeMinutes,
      distanceKm: preTravelResult.distanceKm,
      isOverridden: !!override?.overrideTravelMinutes,
      overrideReason: override?.reason,
    };
    
    // Compute post-travel (from current to next location)
    const postTravelResult = computeTravelBetweenLocations(currentLocation, nextLocation, rules);
    const postTravelSegment: TravelSegment = {
      fromAppointmentId: current.id,
      toAppointmentId: nextAppointmentId || "return",
      fromLocation: currentLocation,
      toLocation: nextLocation,
      travelTimeMinutes: postTravelResult.travelTimeMinutes,
      distanceKm: postTravelResult.distanceKm,
      isOverridden: false,
    };
    
    // Get total travel fee (use override if present)
    const baseFee = current.travel_fee || 0;
    const totalFee = override?.overrideTravelFee ?? baseFee;
    
    results.push({
      appointmentId: current.id,
      preTravelMinutes: preTravelSegment.travelTimeMinutes,
      postTravelMinutes: postTravelSegment.travelTimeMinutes,
      preTravelSegment,
      postTravelSegment,
      totalTravelFee: totalFee,
      isOverridden: !!override,
    });
  }
  
  return results;
}

/**
 * Generate virtual travel blocks for calendar display
 * Uses chained travel computation for accurate positioning
 */
export function generateChainedTravelBlocks(
  appointments: Appointment[],
  staffId: string,
  date: string,
  salonLocations: Map<string, Coordinates>,
  defaultSalonId: string,
  overrides: Map<string, TravelOverride>,
  rules?: Partial<TravelFeeRules>
): Array<{
  id: string;
  staffId: string;
  startTime: string;
  endTime: string;
  type: "pre" | "post";
  appointmentId: string;
  clientName: string;
  travelMinutes: number;
  isOverridden: boolean;
}> {
  const dayAppointments = getStaffDayAppointments(appointments, staffId, date);
  const chainedResults = computeChainedTravel(
    dayAppointments,
    salonLocations,
    defaultSalonId,
    overrides,
    rules
  );
  
  const blocks: Array<{
    id: string;
    staffId: string;
    startTime: string;
    endTime: string;
    type: "pre" | "post";
    appointmentId: string;
    clientName: string;
    travelMinutes: number;
    isOverridden: boolean;
  }> = [];
  
  for (const result of chainedResults) {
    const apt = dayAppointments.find(a => a.id === result.appointmentId);
    if (!apt) continue;
    
    // Pre-travel block (before appointment)
    if (result.preTravelMinutes > 0) {
      const [hour, min] = apt.scheduled_time.split(":").map(Number);
      const startMinutes = hour * 60 + min - result.preTravelMinutes;
      
      if (startMinutes >= 0) {
        const startH = Math.floor(startMinutes / 60);
        const startM = startMinutes % 60;
        
        blocks.push({
          id: `travel-pre-${apt.id}`,
          staffId,
          startTime: `${startH.toString().padStart(2, "0")}:${startM.toString().padStart(2, "0")}`,
          endTime: apt.scheduled_time,
          type: "pre",
          appointmentId: apt.id,
          clientName: apt.client_name,
          travelMinutes: result.preTravelMinutes,
          isOverridden: result.preTravelSegment?.isOverridden || false,
        });
      }
    }
    
    // Post-travel block (after appointment)
    if (result.postTravelMinutes > 0) {
      const [hour, min] = apt.scheduled_time.split(":").map(Number);
      const endMinutes = hour * 60 + min + apt.duration_minutes;
      const postEndMinutes = endMinutes + result.postTravelMinutes;
      
      if (postEndMinutes <= 24 * 60) {
        const endH = Math.floor(endMinutes / 60);
        const endM = endMinutes % 60;
        const postEndH = Math.floor(postEndMinutes / 60);
        const postEndM = postEndMinutes % 60;
        
        blocks.push({
          id: `travel-post-${apt.id}`,
          staffId,
          startTime: `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`,
          endTime: `${postEndH.toString().padStart(2, "0")}:${postEndM.toString().padStart(2, "0")}`,
          type: "post",
          appointmentId: apt.id,
          clientName: apt.client_name,
          travelMinutes: result.postTravelMinutes,
          isOverridden: false,
        });
      }
    }
  }
  
  return blocks;
}

// ============================================================================
// OVERRIDE MANAGEMENT
// ============================================================================

/**
 * Create a travel override for an appointment
 */
export function createTravelOverride(
  appointmentId: string,
  overrides: {
    travelMinutes?: number;
    travelFee?: number;
    reason?: string;
  },
  userId: string
): TravelOverride {
  return {
    appointmentId,
    overrideTravelMinutes: overrides.travelMinutes,
    overrideTravelFee: overrides.travelFee,
    reason: overrides.reason,
    overriddenBy: userId,
    overriddenAt: new Date().toISOString(),
  };
}

/**
 * Serialize overrides for storage in appointment metadata
 */
export function serializeTravelOverride(override: TravelOverride): string {
  return JSON.stringify(override);
}

/**
 * Deserialize overrides from appointment metadata
 */
export function deserializeTravelOverride(json: string): TravelOverride | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
