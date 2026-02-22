/**
 * Mangomint Adapter Layer
 * 
 * Maps existing Beautonomi types to Mangomint-like semantic models.
 * This adapter allows the UI to use consistent Mangomint semantics
 * while preserving existing data structures.
 * 
 * @module lib/scheduling/mangomintAdapter
 */

import type { Appointment, TimeBlock } from "@/lib/provider-portal/types";
import { addMinutes, parseISO } from "date-fns";
import { APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";

// ============================================================================
// ENUMS - Mangomint Semantic Types
// ============================================================================

/**
 * Appointment status following Mangomint semantics
 */
export enum AppointmentStatus {
  UNCONFIRMED = "UNCONFIRMED",
  CONFIRMED = "CONFIRMED",
  WAITING = "WAITING",
  IN_SERVICE = "IN_SERVICE",
  COMPLETED = "COMPLETED",
  CANCELED = "CANCELED",
  NO_SHOW = "NO_SHOW",
}

/**
 * Appointment kind (booking type)
 */
export enum AppointmentKind {
  IN_SALON = "IN_SALON",
  WALK_IN = "WALK_IN",
  AT_HOME = "AT_HOME",
}

/**
 * Visual segment types within an appointment block
 */
export enum SegmentKind {
  SERVICE = "SERVICE",       // Main service time - solid fill
  BUFFER = "BUFFER",         // Buffer between clients - outlined
  PROCESSING = "PROCESSING", // Processing time (color developing) - semi-transparent
  FINISHING = "FINISHING",   // Finishing time - lighter fill
  TRAVEL = "TRAVEL",         // Travel time for at-home - striped
}

/**
 * Calendar block types
 */
export enum BlockKind {
  APPOINTMENT = "APPOINTMENT",
  TIME_BLOCK = "TIME_BLOCK",
  TRAVEL_BLOCK = "TRAVEL_BLOCK",
}

// ============================================================================
// VIEW MODEL TYPES
// ============================================================================

/**
 * A time segment within an appointment (for visual rendering)
 */
export interface AppointmentSegment {
  kind: SegmentKind;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  durationMinutes: number;
}

/**
 * Icon flags for appointment metadata display
 */
export interface AppointmentIconFlags {
  isNewClient: boolean;
  hasNotes: boolean;
  isRepeating: boolean;
  hasMembership: boolean;
  hasFormsIncomplete: boolean;
  hasPhotos: boolean;
  hasConversation: boolean;
  isGroup: boolean;
  requestedProvider: boolean;
  requestedGender: string | null;
  hasCustomization: boolean;
  isWalkIn: boolean;
  isAtHome: boolean;
}

/**
 * Mangomint-style appointment view model
 */
export interface MangomintAppointment {
  // Core identity
  id: string;
  refNumber: string;
  
  // Timing (UTC stored, localized for display)
  startTimeUtc: Date;
  endTimeUtc: Date;
  startTimeLocal: string; // Display string
  endTimeLocal: string;   // Display string
  durationMinutes: number;
  
  // Relationships
  staffId: string;
  staffName: string;
  locationId: string | null;
  locationName: string | null;
  clientId: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  
  // Service info
  serviceName: string;
  serviceId: string;
  price: number;
  
  // Mangomint semantics
  status: AppointmentStatus;
  kind: AppointmentKind;
  
  // Visual segments
  segments: AppointmentSegment[];
  
  // Icon flags
  iconFlags: AppointmentIconFlags;
  
  // At-home specific
  address: string | null;
  travelFee: number | null;
  travelTimeMinutes: number | null;
  
  // Original appointment for mutations
  _original: Appointment;
}

/**
 * Mangomint-style calendar block (time block or travel block)
 */
export interface MangomintBlock {
  id: string;
  kind: BlockKind;
  staffId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  name: string;
  description?: string;
  color?: string;
  _original: TimeBlock;
}

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Map existing appointment status to Mangomint semantic status.
 * For in-salon bookings: when status is booked/confirmed AND current_stage is 'client_arrived',
 * the client has checked in → WAITING (ready for service).
 */
export function mapStatus(
  statusOrAppointment: Appointment["status"] | Pick<Appointment, "status" | "current_stage" | "location_type">
): AppointmentStatus {
  const status = typeof statusOrAppointment === "string"
    ? statusOrAppointment
    : statusOrAppointment.status;
  const currentStage = typeof statusOrAppointment === "string" ? undefined : (statusOrAppointment as any).current_stage;
  const locationType = typeof statusOrAppointment === "string" ? undefined : (statusOrAppointment as any).location_type;

  // In-salon: status is booked/confirmed and client has arrived → WAITING (client checked in, ready for service)
  // Note: API may return "confirmed" (database format) which maps to "booked"
  const statusStr = status as string;
  if (
    (status === APPOINTMENT_STATUS.BOOKED || statusStr === "booked" || statusStr === "confirmed") &&
    currentStage === "client_arrived" &&
    locationType !== "at_home"
  ) {
    return AppointmentStatus.WAITING;
  }

  switch (status) {
    case APPOINTMENT_STATUS.PENDING:
    case "pending":
      return AppointmentStatus.UNCONFIRMED;
    case APPOINTMENT_STATUS.BOOKED:
    case "booked":
    case "confirmed":
      return AppointmentStatus.CONFIRMED;
    case APPOINTMENT_STATUS.STARTED:
    case "started":
    case "in_progress":
      return AppointmentStatus.IN_SERVICE;
    case APPOINTMENT_STATUS.COMPLETED:
    case "completed":
      return AppointmentStatus.COMPLETED;
    case APPOINTMENT_STATUS.CANCELLED:
    case "cancelled":
      return AppointmentStatus.CANCELED;
    case APPOINTMENT_STATUS.NO_SHOW:
    case "no_show":
      return AppointmentStatus.NO_SHOW;
    default:
      return AppointmentStatus.CONFIRMED;
  }
}

/**
 * Map Mangomint status back to existing appointment status
 */
export function unmapStatus(status: AppointmentStatus): Appointment["status"] {
  switch (status) {
    case AppointmentStatus.UNCONFIRMED:
      return APPOINTMENT_STATUS.PENDING;
    case AppointmentStatus.CONFIRMED:
      return APPOINTMENT_STATUS.BOOKED;
    case AppointmentStatus.WAITING:
      return APPOINTMENT_STATUS.BOOKED; // Map waiting to booked with separate flag
    case AppointmentStatus.IN_SERVICE:
      return APPOINTMENT_STATUS.STARTED;
    case AppointmentStatus.COMPLETED:
      return APPOINTMENT_STATUS.COMPLETED;
    case AppointmentStatus.CANCELED:
      return APPOINTMENT_STATUS.CANCELLED;
    case AppointmentStatus.NO_SHOW:
      return APPOINTMENT_STATUS.NO_SHOW;
    default:
      return APPOINTMENT_STATUS.BOOKED;
  }
}

/**
 * Determine appointment kind from appointment data
 */
export function mapKind(appointment: Appointment): AppointmentKind {
  // Check for at-home first
  if (appointment.location_type === "at_home") {
    return AppointmentKind.AT_HOME;
  }
  
  // Check for walk-in (could be a metadata flag or inferred from booking source)
  // For now, we can add a walk-in flag check if the metadata exists
  const metadata = appointment as any;
  if (metadata.is_walk_in || metadata.booking_source === "walk_in") {
    return AppointmentKind.WALK_IN;
  }
  
  return AppointmentKind.IN_SALON;
}

/**
 * Calculate time segments for an appointment
 * This considers buffer time, processing time, and finishing time
 */
export function calculateSegments(
  appointment: Appointment,
  options: {
    bufferMinutes?: number;
    processingMinutes?: number;
    finishingMinutes?: number;
    travelMinutesBefore?: number;
    travelMinutesAfter?: number;
  } = {}
): AppointmentSegment[] {
  const segments: AppointmentSegment[] = [];
  const [hour, minute] = appointment.scheduled_time.split(":").map(Number);
  
  let currentMinutes = hour * 60 + minute;
  
  // Pre-travel for at-home (if applicable)
  if (options.travelMinutesBefore && options.travelMinutesBefore > 0) {
    const travelStart = currentMinutes - options.travelMinutesBefore;
    segments.push({
      kind: SegmentKind.TRAVEL,
      startTime: minutesToTime(travelStart),
      endTime: minutesToTime(currentMinutes),
      durationMinutes: options.travelMinutesBefore,
    });
  }
  
  // Calculate service time (main duration minus optional segments)
  let remainingDuration = appointment.duration_minutes;
  
  // Buffer time at the beginning (if any)
  if (options.bufferMinutes && options.bufferMinutes > 0) {
    segments.push({
      kind: SegmentKind.BUFFER,
      startTime: minutesToTime(currentMinutes),
      endTime: minutesToTime(currentMinutes + options.bufferMinutes),
      durationMinutes: options.bufferMinutes,
    });
    currentMinutes += options.bufferMinutes;
    remainingDuration -= options.bufferMinutes;
  }
  
  // Finishing time at the end
  const finishingTime = options.finishingMinutes || 0;
  const processingTime = options.processingMinutes || 0;
  
  // Main service time
  const serviceTime = remainingDuration - finishingTime - processingTime;
  if (serviceTime > 0) {
    segments.push({
      kind: SegmentKind.SERVICE,
      startTime: minutesToTime(currentMinutes),
      endTime: minutesToTime(currentMinutes + serviceTime),
      durationMinutes: serviceTime,
    });
    currentMinutes += serviceTime;
  }
  
  // Processing time (e.g., color developing)
  if (processingTime > 0) {
    segments.push({
      kind: SegmentKind.PROCESSING,
      startTime: minutesToTime(currentMinutes),
      endTime: minutesToTime(currentMinutes + processingTime),
      durationMinutes: processingTime,
    });
    currentMinutes += processingTime;
  }
  
  // Finishing time
  if (finishingTime > 0) {
    segments.push({
      kind: SegmentKind.FINISHING,
      startTime: minutesToTime(currentMinutes),
      endTime: minutesToTime(currentMinutes + finishingTime),
      durationMinutes: finishingTime,
    });
    currentMinutes += finishingTime;
  }
  
  // Post-travel for at-home (if applicable)
  if (options.travelMinutesAfter && options.travelMinutesAfter > 0) {
    segments.push({
      kind: SegmentKind.TRAVEL,
      startTime: minutesToTime(currentMinutes),
      endTime: minutesToTime(currentMinutes + options.travelMinutesAfter),
      durationMinutes: options.travelMinutesAfter,
    });
  }
  
  // If no segments were added, add the entire duration as service
  if (segments.length === 0) {
    segments.push({
      kind: SegmentKind.SERVICE,
      startTime: appointment.scheduled_time,
      endTime: minutesToTime(hour * 60 + minute + appointment.duration_minutes),
      durationMinutes: appointment.duration_minutes,
    });
  }
  
  return segments;
}

/**
 * Extract icon flags from appointment metadata
 */
export function extractIconFlags(appointment: Appointment): AppointmentIconFlags {
  const metadata = appointment as any;
  
  return {
    isNewClient: metadata.is_new_client || false,
    hasNotes: !!appointment.notes || !!appointment.internal_notes,
    isRepeating: metadata.is_recurring || false,
    hasMembership: metadata.has_membership || false,
    hasFormsIncomplete: metadata.forms_incomplete || false,
    hasPhotos: metadata.has_photos || false,
    hasConversation: metadata.has_conversation || false,
    isGroup: appointment.is_group_booking || false,
    requestedProvider: metadata.requested_provider || false,
    requestedGender: metadata.requested_gender || null,
    hasCustomization: !!appointment.service_customization,
    isWalkIn: metadata.is_walk_in || false,
    isAtHome: appointment.location_type === "at_home",
  };
}

/**
 * Convert an existing appointment to Mangomint view model
 */
export function toMangomintAppointment(
  appointment: Appointment,
  options: {
    timezone?: string;
    bufferMinutes?: number;
    processingMinutes?: number;
    finishingMinutes?: number;
    travelMinutesBefore?: number;
    travelMinutesAfter?: number;
  } = {}
): MangomintAppointment {
  const startTimeUtc = parseISO(`${appointment.scheduled_date}T${appointment.scheduled_time}`);
  const endTimeUtc = addMinutes(startTimeUtc, appointment.duration_minutes);
  
  // Build address string for at-home
  let address: string | null = null;
  if (appointment.location_type === "at_home") {
    const parts = [
      appointment.address_line1,
      appointment.address_line2,
      appointment.address_city,
      appointment.address_postal_code,
    ].filter(Boolean);
    address = parts.join(", ") || null;
  }
  
  return {
    id: appointment.id,
    refNumber: appointment.ref_number,
    
    startTimeUtc,
    endTimeUtc,
    startTimeLocal: appointment.scheduled_time,
    endTimeLocal: minutesToTime(
      parseInt(appointment.scheduled_time.split(":")[0]) * 60 +
      parseInt(appointment.scheduled_time.split(":")[1]) +
      appointment.duration_minutes
    ),
    durationMinutes: appointment.duration_minutes,
    
    staffId: appointment.team_member_id,
    staffName: appointment.team_member_name,
    locationId: appointment.location_id || null,
    locationName: appointment.location_name || null,
    clientId: appointment.client_id || null,
    clientName: appointment.client_name,
    clientEmail: appointment.client_email || null,
    clientPhone: appointment.client_phone || null,
    
    serviceName: appointment.service_name,
    serviceId: appointment.service_id,
    price: appointment.price,
    
    status: mapStatus(appointment),
    kind: mapKind(appointment),
    
    segments: calculateSegments(appointment, options),
    iconFlags: extractIconFlags(appointment),
    
    address,
    travelFee: appointment.travel_fee || null,
    travelTimeMinutes: options.travelMinutesBefore || null,
    
    _original: appointment,
  };
}

/**
 * Convert a time block to Mangomint block model
 */
export function toMangomintBlock(timeBlock: TimeBlock): MangomintBlock {
  const [startH, startM] = timeBlock.start_time.split(":").map(Number);
  const [endH, endM] = timeBlock.end_time.split(":").map(Number);
  const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  
  return {
    id: timeBlock.id,
    kind: BlockKind.TIME_BLOCK,
    staffId: timeBlock.team_member_id || "",
    startTime: timeBlock.start_time,
    endTime: timeBlock.end_time,
    durationMinutes,
    name: timeBlock.name || timeBlock.blocked_time_type_name || "Blocked",
    description: timeBlock.description,
    color: undefined, // Can be added from blocked_time_type
    _original: timeBlock,
  };
}

/**
 * Generate virtual travel blocks for at-home appointments
 * These are computed blocks that don't exist in the database but 
 * should be visualized and considered for conflict checking
 */
export function generateTravelBlocks(
  appointment: MangomintAppointment,
  travelTimeMinutes: number
): MangomintBlock[] {
  if (appointment.kind !== AppointmentKind.AT_HOME || travelTimeMinutes <= 0) {
    return [];
  }

  const blocks: MangomintBlock[] = [];
  const startMin = timeToMinutes(appointment.startTimeLocal);
  const endMin = timeToMinutes(appointment.endTimeLocal);

  // Pre-appointment travel block
  const preTravelStartMin = startMin - travelTimeMinutes;
  if (preTravelStartMin >= 0) {
    blocks.push({
      id: `travel-pre-${appointment.id}`,
      kind: BlockKind.TRAVEL_BLOCK,
      staffId: appointment.staffId,
      startTime: minutesToTime(preTravelStartMin),
      endTime: appointment.startTimeLocal,
      durationMinutes: travelTimeMinutes,
      name: "Travel to client",
      description: `Travel time for ${appointment.clientName}`,
      color: "#60A5FA", // Blue
      _original: {} as TimeBlock, // Virtual block
    });
  }

  // Post-appointment travel block (return trip)
  const postTravelEndMin = endMin + travelTimeMinutes;
  if (postTravelEndMin <= 24 * 60) {
    blocks.push({
      id: `travel-post-${appointment.id}`,
      kind: BlockKind.TRAVEL_BLOCK,
      staffId: appointment.staffId,
      startTime: appointment.endTimeLocal,
      endTime: minutesToTime(postTravelEndMin),
      durationMinutes: travelTimeMinutes,
      name: "Return from client",
      description: `Return travel from ${appointment.clientName}`,
      color: "#60A5FA", // Blue
      _original: {} as TimeBlock, // Virtual block
    });
  }

  return blocks;
}

/**
 * Get all blocks (time blocks + virtual travel blocks) for conflict checking
 */
export function getAllBlocks(
  timeBlocks: TimeBlock[],
  appointments: Appointment[],
  defaultTravelTimeMinutes: number = 30
): MangomintBlock[] {
  const blocks: MangomintBlock[] = [];

  // Add actual time blocks
  for (const tb of timeBlocks) {
    blocks.push(toMangomintBlock(tb));
  }

  // Add virtual travel blocks for at-home appointments
  for (const apt of appointments) {
    if (apt.location_type === "at_home") {
      const mangomintApt = toMangomintAppointment(apt, {
        travelMinutesBefore: defaultTravelTimeMinutes,
        travelMinutesAfter: defaultTravelTimeMinutes,
      });
      
      // Get travel time from appointment or use default
      const travelTime = mangomintApt.travelTimeMinutes || defaultTravelTimeMinutes;
      const travelBlocks = generateTravelBlocks(mangomintApt, travelTime);
      blocks.push(...travelBlocks);
    }
  }

  return blocks;
}

// ============================================================================
// CONFLICT DETECTION HELPERS
// ============================================================================

/**
 * Check if two time intervals overlap
 */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const aStartMin = timeToMinutes(aStart);
  const aEndMin = timeToMinutes(aEnd);
  const bStartMin = timeToMinutes(bStart);
  const bEndMin = timeToMinutes(bEnd);
  
  return aStartMin < bEndMin && aEndMin > bStartMin;
}

/**
 * Check if an appointment can be placed at a target slot
 */
export function canPlace(
  appointment: MangomintAppointment | { startTime: string; durationMinutes: number; staffId: string },
  targetSlot: { date: string; time: string; staffId: string },
  existingAppointments: MangomintAppointment[],
  timeBlocks: MangomintBlock[],
  options: {
    allowDoubleBooking?: boolean;
    processingFreesProvider?: boolean;
  } = {}
): { valid: boolean; reason?: string; conflictsWith?: string[] } {
  const conflicts: string[] = [];
  
  const targetStartMin = timeToMinutes(targetSlot.time);
  const durationMin = "durationMinutes" in appointment 
    ? appointment.durationMinutes 
    : (appointment as MangomintAppointment)._original?.duration_minutes || 60;
  const targetEndTime = minutesToTime(targetStartMin + durationMin);
  
  // Check against existing appointments for the same staff on the same date
  for (const existing of existingAppointments) {
    // Skip self
    if ("id" in appointment && existing.id === appointment.id) continue;
    
    // Skip different staff
    if (existing.staffId !== targetSlot.staffId) continue;
    
    // Skip different date (if we have date info)
    // For now, assume appointments are filtered to the target date
    
    // Check overlap
    if (overlaps(targetSlot.time, targetEndTime, existing.startTimeLocal, existing.endTimeLocal)) {
      // If processing frees provider and the overlap is only with processing segment
      if (options.processingFreesProvider) {
        const processingSegments = existing.segments.filter(s => s.kind === SegmentKind.PROCESSING);
        if (processingSegments.length > 0) {
          const onlyOverlapsProcessing = processingSegments.some(seg => 
            overlaps(targetSlot.time, targetEndTime, seg.startTime, seg.endTime)
          );
          if (onlyOverlapsProcessing) continue;
        }
      }
      
      if (!options.allowDoubleBooking) {
        conflicts.push(existing.id);
      }
    }
  }
  
  // Check against time blocks
  for (const block of timeBlocks) {
    if (block.staffId !== targetSlot.staffId) continue;
    
    if (overlaps(targetSlot.time, targetEndTime, block.startTime, block.endTime)) {
      conflicts.push(`block:${block.id}`);
    }
  }
  
  if (conflicts.length > 0) {
    return {
      valid: false,
      reason: `Conflicts with ${conflicts.length} existing booking(s) or block(s)`,
      conflictsWith: conflicts,
    };
  }
  
  return { valid: true };
}

/**
 * Snap a time to the nearest increment
 */
export function snapToIncrement(time: string, incrementMinutes: number = 15): string {
  const minutes = timeToMinutes(time);
  const snapped = Math.round(minutes / incrementMinutes) * incrementMinutes;
  return minutesToTime(snapped);
}

/**
 * Get available slots for a staff member on a date
 */
export function getAvailableSlots(
  staffId: string,
  date: string,
  existingAppointments: MangomintAppointment[],
  timeBlocks: MangomintBlock[],
  workdayStart: string = "08:00",
  workdayEnd: string = "20:00",
  slotDuration: number = 30,
  incrementMinutes: number = 15
): string[] {
  const slots: string[] = [];
  const startMin = timeToMinutes(workdayStart);
  const endMin = timeToMinutes(workdayEnd);
  
  for (let min = startMin; min < endMin; min += incrementMinutes) {
    const slotTime = minutesToTime(min);
    const result = canPlace(
      { startTime: slotTime, durationMinutes: slotDuration, staffId },
      { date, time: slotTime, staffId },
      existingAppointments,
      timeBlocks
    );
    
    if (result.valid) {
      slots.push(slotTime);
    }
  }
  
  return slots;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert time string (HH:mm) to total minutes
 */
export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Convert total minutes to time string (HH:mm)
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Format time for display (12-hour format)
 */
export function formatTime12h(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Check if the feature flag is enabled
 * Default to true since Mangomint mode is now the primary calendar experience
 */
export function isMangomintModeEnabled(): boolean {
  // Default to true, can be disabled by setting NEXT_PUBLIC_MANGOMINT_MODE=false
  const envValue = process.env.NEXT_PUBLIC_MANGOMINT_MODE;
  if (envValue === "false") return false;
  return true; // Default enabled
}
