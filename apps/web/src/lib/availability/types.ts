/**
 * Availability Engine Types
 * Type definitions for the availability calculation system
 */

export interface TimeSlot {
  time: string; // Format: "HH:MM"
  available: boolean;
  reason?: string; // Explanation if not available
}

export interface StaffShift {
  id: string;
  staff_id: string;
  date: string; // ISO date string
  start_time: string; // Format: "HH:MM:SS"
  end_time: string; // Format: "HH:MM:SS"
  is_recurring: boolean;
  recurring_pattern?: {
    frequency: 'weekly' | 'daily' | 'monthly';
    days?: number[]; // 0-6 for weekly (0 = Sunday)
    end_date?: string;
  };
}

export interface TimeBlock {
  id: string;
  staff_id: string | null; // null = applies to all staff
  date: string; // ISO date string
  start_time: string; // Format: "HH:MM:SS"
  end_time: string; // Format: "HH:MM:SS"
  is_recurring: boolean;
  recurring_pattern?: {
    frequency: 'weekly' | 'daily' | 'monthly';
    days?: number[];
    end_date?: string;
  };
  is_active: boolean;
}

export interface BookingService {
  id: string;
  booking_id: string;
  offering_id: string;
  staff_id: string | null;
  scheduled_start_at: string; // ISO timestamp
  scheduled_end_at: string; // ISO timestamp
  duration_minutes: number;
  buffer_minutes: number; // From offerings table
  processing_minutes: number; // From offerings table (default 0)
  finishing_minutes: number; // From offerings table (default 0)
}

export interface AvailabilityConstraints {
  staffShifts: StaffShift[];
  timeBlocks: TimeBlock[];
  existingBookings: BookingService[];
}

export interface AvailabilityRequest {
  staffId: string | null; // null = any staff
  date: string; // ISO date string
  duration: number; // Total duration in minutes
  locationType: 'at_salon' | 'at_home';
  travelBuffer?: number; // Minutes for at-home bookings
  resourceIds?: string[]; // Required resources (future)
  avoidGaps?: boolean; // Provider preference
}

export interface TimeSegment {
  start: Date;
  end: Date;
  type: 'blocked' | 'available'; // blocked = not bookable, available = bookable (processing time)
}
