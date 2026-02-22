/**
 * Calendar Preferences Management
 * 
 * Handles user preferences for calendar display including
 * Mangomint-specific features like high contrast mode and
 * show/hide canceled appointments.
 * 
 * Preferences are stored in localStorage with optional
 * server-side persistence for logged-in users.
 * 
 * @module lib/settings/calendarPreferences
 */

import { AppointmentStatus } from "../scheduling/mangomintAdapter";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Mangomint-specific calendar preferences
 */
export interface MangomintCalendarPreferences {
  /** High contrast mode for accessibility */
  highContrast: boolean;
  
  /** Show/hide canceled appointments on the calendar */
  showCanceled: boolean;
  
  /** Time grid increment in minutes (5, 10, 15) */
  timeIncrementMinutes: 5 | 10 | 15;
  
  /** Workday start hour (0-23) */
  workdayStartHour: number;
  
  /** Workday end hour (0-23) */
  workdayEndHour: number;
  
  /** Show processing and buffer time segments */
  showProcessingAndBuffer: boolean;
  
  /** Default status for new appointments */
  defaultNewAppointmentStatus: AppointmentStatus.UNCONFIRMED | AppointmentStatus.CONFIRMED;
  
  /** Whether processing time frees the provider for other bookings */
  processingFreesProvider: boolean;
  
  /** Color appointments by status or service */
  colorBy: "status" | "service" | "team_member";
  
  /** Scroll to current time on calendar load */
  scrollToNow: boolean;
  
  /** Show appointment icons (new client, notes, etc.) */
  showAppointmentIcons: boolean;
  
  /** Compact mode for appointment blocks */
  compactMode: boolean;
  
  /** Show service prices on appointment blocks */
  showPrices: boolean;
  
  /** Show client phone on hover/click */
  showClientPhone: boolean;
}

/**
 * Default preferences
 */
export const DEFAULT_PREFERENCES: MangomintCalendarPreferences = {
  highContrast: false,
  showCanceled: true,
  timeIncrementMinutes: 15,
  workdayStartHour: 8,
  workdayEndHour: 20,
  showProcessingAndBuffer: true,
  defaultNewAppointmentStatus: AppointmentStatus.CONFIRMED,
  processingFreesProvider: false,
  colorBy: "status",
  scrollToNow: true,
  showAppointmentIcons: true,
  compactMode: false,
  showPrices: false,
  showClientPhone: true,
};

// ============================================================================
// LOCAL STORAGE KEYS
// ============================================================================

const _STORAGE_KEY = "beautonomi_calendar_preferences";
const MANGOMINT_STORAGE_KEY = "beautonomi_mangomint_preferences";

// ============================================================================
// PREFERENCE MANAGEMENT
// ============================================================================

/**
 * Load calendar preferences from localStorage
 */
export function loadPreferences(): MangomintCalendarPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  
  try {
    const stored = localStorage.getItem(MANGOMINT_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_PREFERENCES;
    }
    
    const parsed = JSON.parse(stored);
    
    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch (error) {
    console.error("Failed to load calendar preferences:", error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save calendar preferences to localStorage
 */
export function savePreferences(preferences: Partial<MangomintCalendarPreferences>): void {
  if (typeof window === "undefined") {
    return;
  }
  
  try {
    const current = loadPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(MANGOMINT_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Failed to save calendar preferences:", error);
  }
}

/**
 * Reset preferences to defaults
 */
export function resetPreferences(): void {
  if (typeof window === "undefined") {
    return;
  }
  
  try {
    localStorage.removeItem(MANGOMINT_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to reset calendar preferences:", error);
  }
}

/**
 * Toggle high contrast mode
 */
export function toggleHighContrast(): boolean {
  const current = loadPreferences();
  const newValue = !current.highContrast;
  savePreferences({ highContrast: newValue });
  return newValue;
}

/**
 * Toggle show canceled appointments
 */
export function toggleShowCanceled(): boolean {
  const current = loadPreferences();
  const newValue = !current.showCanceled;
  savePreferences({ showCanceled: newValue });
  return newValue;
}

// ============================================================================
// REACT HOOK
// ============================================================================

import { useState, useEffect, useCallback } from "react";

/**
 * React hook for managing calendar preferences
 */
export function useCalendarPreferences() {
  const [preferences, setPreferences] = useState<MangomintCalendarPreferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Load preferences on mount
  useEffect(() => {
    const loaded = loadPreferences();
    queueMicrotask(() => {
      setPreferences(loaded);
      setIsLoaded(true);
    });
  }, []);
  
  // Update a single preference
  const updatePreference = useCallback(<K extends keyof MangomintCalendarPreferences>(
    key: K,
    value: MangomintCalendarPreferences[K]
  ) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value };
      savePreferences({ [key]: value });
      return updated;
    });
  }, []);
  
  // Update multiple preferences
  const updatePreferences = useCallback((updates: Partial<MangomintCalendarPreferences>) => {
    setPreferences(prev => {
      const updated = { ...prev, ...updates };
      savePreferences(updates);
      return updated;
    });
  }, []);
  
  // Toggle helpers
  const toggleHighContrastMode = useCallback(() => {
    updatePreference("highContrast", !preferences.highContrast);
  }, [preferences.highContrast, updatePreference]);
  
  const toggleShowCanceledAppointments = useCallback(() => {
    updatePreference("showCanceled", !preferences.showCanceled);
  }, [preferences.showCanceled, updatePreference]);
  
  const toggleCompactMode = useCallback(() => {
    updatePreference("compactMode", !preferences.compactMode);
  }, [preferences.compactMode, updatePreference]);
  
  const toggleShowIcons = useCallback(() => {
    updatePreference("showAppointmentIcons", !preferences.showAppointmentIcons);
  }, [preferences.showAppointmentIcons, updatePreference]);
  
  // Reset to defaults
  const reset = useCallback(() => {
    resetPreferences();
    setPreferences(DEFAULT_PREFERENCES);
  }, []);
  
  return {
    preferences,
    isLoaded,
    updatePreference,
    updatePreferences,
    toggleHighContrastMode,
    toggleShowCanceledAppointments,
    toggleCompactMode,
    toggleShowIcons,
    reset,
  };
}

// ============================================================================
// SERVER SYNC (FUTURE)
// ============================================================================

/**
 * Sync preferences to server (for logged-in users)
 * This can be implemented later to persist preferences across devices
 */
export async function syncPreferencesToServer(
  providerId: string,
  preferences: MangomintCalendarPreferences
): Promise<void> {
  try {
    await fetch("/api/provider/settings/calendar-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    });
  } catch (error) {
    console.warn("Failed to sync calendar preferences to server:", error);
  }
}

/**
 * Load preferences from server
 */
export async function loadPreferencesFromServer(
  _providerId: string
): Promise<MangomintCalendarPreferences | null> {
  try {
    const response = await fetch("/api/provider/settings/calendar-preferences");
    if (response.ok) {
      const data = await response.json();
      if (data.data) return data.data;
    }
  } catch (error) {
    console.warn("Failed to load calendar preferences from server:", error);
  }
  return null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get CSS class for high contrast mode
 */
export function getHighContrastClass(highContrast: boolean): string {
  return highContrast ? "high-contrast" : "";
}

/**
 * Get time slots based on preferences
 */
export function getTimeSlots(
  startHour: number,
  endHour: number,
  incrementMinutes: number
): string[] {
  const slots: string[] = [];
  
  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += incrementMinutes) {
      if (hour === endHour && minute > 0) break;
      
      const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      slots.push(time);
    }
  }
  
  return slots;
}

/**
 * Check if a time is within working hours
 */
export function isWithinWorkingHours(
  time: string,
  startHour: number,
  endHour: number
): boolean {
  const [hour] = time.split(":").map(Number);
  return hour >= startHour && hour < endHour;
}
