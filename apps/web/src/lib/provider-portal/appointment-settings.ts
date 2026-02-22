/**
 * Appointment Settings Utilities
 * 
 * Provides functions to load and manage dynamic appointment settings
 * from the database with fallback to static constants.
 */

import { APPOINTMENT_STATUS, DEFAULT_APPOINTMENT_STATUS } from "./constants";

export interface AppointmentSettings {
  defaultAppointmentStatus: string;
  autoConfirmAppointments: boolean;
  requireConfirmationForBookings: boolean;
  updatedAt: string | null;
}

/**
 * Get appointment settings for a provider
 * This function can be called from server components or API routes
 */
export async function getAppointmentSettings(_providerId: string): Promise<AppointmentSettings> {
  try {
    const { fetcher } = await import("@/lib/http/fetcher");
    const response = await fetcher.get<{ data: AppointmentSettings }>(
      `/api/provider/settings/appointments`
    );
    return response.data;
  } catch (error) {
    console.warn("Failed to load appointment settings, using defaults:", error);
    // Return defaults if API call fails
    return {
      defaultAppointmentStatus: DEFAULT_APPOINTMENT_STATUS,
      autoConfirmAppointments: false,
      requireConfirmationForBookings: true,
      updatedAt: null,
    };
  }
}

/**
 * Get default appointment status for a provider
 * Returns the provider's configured default or the system default
 */
export async function getDefaultAppointmentStatus(providerId?: string): Promise<string> {
  if (!providerId) {
    return DEFAULT_APPOINTMENT_STATUS;
  }

  try {
    const settings = await getAppointmentSettings(providerId);
    return settings.defaultAppointmentStatus || DEFAULT_APPOINTMENT_STATUS;
  } catch (error) {
    console.warn("Failed to load default status, using constant:", error);
    return DEFAULT_APPOINTMENT_STATUS;
  }
}

/**
 * Update appointment settings for a provider
 */
export async function updateAppointmentSettings(
  settings: Partial<AppointmentSettings>
): Promise<AppointmentSettings> {
  const { fetcher } = await import("@/lib/http/fetcher");
  const response = await fetcher.patch<{ data: AppointmentSettings }>(
    `/api/provider/settings/appointments`,
    settings
  );
  return response.data;
}

/**
 * Check if a provider has auto-confirm enabled
 */
export async function shouldAutoConfirm(providerId?: string): Promise<boolean> {
  if (!providerId) {
    return false;
  }

  try {
    const settings = await getAppointmentSettings(providerId);
    return settings.autoConfirmAppointments ?? false;
  } catch (error) {
    console.warn("Failed to load auto-confirm setting, defaulting to false:", error);
    return false;
  }
}

/**
 * Determine the final appointment status based on provider settings
 * 
 * Logic:
 * 1. If requireConfirmationForBookings is true → always use "pending" (overrides default)
 * 2. Otherwise, use defaultAppointmentStatus
 * 3. If autoConfirmAppointments is true AND status is "pending" AND requireConfirmationForBookings is false → change to "confirmed"
 * 
 * @param providerId - Provider ID
 * @param explicitStatus - Optional explicit status from request body (takes precedence if provided)
 * @returns The final appointment status to use
 */
export async function determineAppointmentStatus(
  providerId: string,
  explicitStatus?: string
): Promise<string> {
  // If explicit status is provided, use it (allows manual override)
  if (explicitStatus) {
    return explicitStatus;
  }

  try {
    const settings = await getAppointmentSettings(providerId);
    let status = settings.defaultAppointmentStatus || DEFAULT_APPOINTMENT_STATUS;

    // If require confirmation is enabled, force status to "pending"
    if (settings.requireConfirmationForBookings) {
      status = APPOINTMENT_STATUS.PENDING;
    } else {
      // Use default status
      status = settings.defaultAppointmentStatus || DEFAULT_APPOINTMENT_STATUS;

      // If auto-confirm is enabled and status would be pending, change to confirmed
      if (settings.autoConfirmAppointments && status === APPOINTMENT_STATUS.PENDING) {
        status = APPOINTMENT_STATUS.BOOKED;
      }
    }

    return status;
  } catch (error) {
    console.warn("Failed to load appointment settings, using default:", error);
    return DEFAULT_APPOINTMENT_STATUS;
  }
}

/**
 * Get appointment settings directly from database (for server-side use)
 * This is more efficient than going through the API
 */
export async function getAppointmentSettingsFromDB(
  supabaseAdmin: any,
  providerId: string
): Promise<AppointmentSettings> {
  try {
    const { data: provider, error } = await supabaseAdmin
      .from("providers")
      .select("default_appointment_status, auto_confirm_appointments, require_confirmation_for_bookings, appointment_settings_updated_at")
      .eq("id", providerId)
      .single();

    if (error || !provider) {
      throw error || new Error("Provider not found");
    }

    return {
      defaultAppointmentStatus: provider.default_appointment_status || DEFAULT_APPOINTMENT_STATUS,
      autoConfirmAppointments: provider.auto_confirm_appointments ?? false,
      requireConfirmationForBookings: provider.require_confirmation_for_bookings ?? true,
      updatedAt: provider.appointment_settings_updated_at || null,
    };
  } catch (error) {
    console.warn("Failed to load appointment settings from DB, using defaults:", error);
    return {
      defaultAppointmentStatus: DEFAULT_APPOINTMENT_STATUS,
      autoConfirmAppointments: false,
      requireConfirmationForBookings: true,
      updatedAt: null,
    };
  }
}

/**
 * Determine appointment status from database settings (for server-side use)
 * More efficient than going through the API
 */
export async function determineAppointmentStatusFromDB(
  supabaseAdmin: any,
  providerId: string,
  explicitStatus?: string
): Promise<string> {
  // If explicit status is provided, use it (allows manual override)
  if (explicitStatus) {
    return explicitStatus;
  }

  try {
    const settings = await getAppointmentSettingsFromDB(supabaseAdmin, providerId);
    let status = settings.defaultAppointmentStatus || DEFAULT_APPOINTMENT_STATUS;

    // If require confirmation is enabled, force status to "pending"
    if (settings.requireConfirmationForBookings) {
      status = APPOINTMENT_STATUS.PENDING;
    } else {
      // Use default status
      status = settings.defaultAppointmentStatus || DEFAULT_APPOINTMENT_STATUS;

      // If auto-confirm is enabled and status would be pending, change to confirmed
      if (settings.autoConfirmAppointments && status === APPOINTMENT_STATUS.PENDING) {
        status = APPOINTMENT_STATUS.BOOKED;
      }
    }

    return status;
  } catch (error) {
    console.warn("Failed to determine appointment status, using default:", error);
    return DEFAULT_APPOINTMENT_STATUS;
  }
}
