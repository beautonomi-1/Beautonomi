/**
 * Provider Portal Constants
 * 
 * Centralized constants for appointment statuses and other values
 * to avoid hardcoded strings throughout the codebase.
 * 
 * NOTE: These constants are STATIC and defined at compile time.
 * They match the database schema values and should not be changed
 * without updating the database schema and all related code.
 * 
 * For dynamic configuration, consider:
 * 1. Database-driven configuration (system_settings table)
 * 2. Environment variables for deployment-specific values
 * 3. Provider-specific settings (provider_settings table)
 */

/**
 * Appointment status values (database format)
 * These match the Appointment type status field and database CHECK constraints
 * 
 * Database Schema Reference:
 * - bookings.status: TEXT with CHECK constraint
 * - Valid values: 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
 * 
 * These values are HARDCODED in the database schema and cannot be changed
 * without a database migration.
 */
export const APPOINTMENT_STATUS = {
  PENDING: "pending",
  BOOKED: "booked", // Maps to database 'confirmed' status
  STARTED: "started", // Maps to database 'in_progress' status
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
} as const;

/**
 * Default appointment status for new appointments
 * 
 * This is STATIC and cannot be changed dynamically.
 * To make this configurable:
 * 1. Add a provider_settings table column for default_status
 * 2. Load it from the database when creating appointments
 * 3. Fall back to this constant if not set
 */
export const DEFAULT_APPOINTMENT_STATUS = APPOINTMENT_STATUS.BOOKED;

/**
 * Type helper for appointment status values
 */
export type AppointmentStatusValue = typeof APPOINTMENT_STATUS[keyof typeof APPOINTMENT_STATUS];

/**
 * Get all valid appointment status values
 * Useful for validation and dropdowns
 */
export function getAppointmentStatuses(): readonly string[] {
  return Object.values(APPOINTMENT_STATUS);
}

/**
 * Check if a status value is valid
 */
export function isValidAppointmentStatus(status: string): status is AppointmentStatusValue {
  return Object.values(APPOINTMENT_STATUS).includes(status as AppointmentStatusValue);
}
