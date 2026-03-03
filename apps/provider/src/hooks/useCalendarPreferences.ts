import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export type ColorByMode = "status" | "service" | "team_member";
export type TimeIncrement = 5 | 10 | 15;
export type DefaultAppointmentStatus = "confirmed" | "unconfirmed";

export interface CalendarPreferences {
  // Display
  highContrast: boolean;
  showCanceled: boolean;
  compactMode: boolean;
  showAppointmentIcons: boolean;
  showPrices: boolean;
  showClientPhone: boolean;

  // Colors
  colorBy: ColorByMode;

  // Time Grid
  timeIncrementMinutes: TimeIncrement;
  scrollToNow: boolean;
  workdayStartHour: number;
  workdayEndHour: number;

  // Booking behavior
  showProcessingAndBuffer: boolean;
  defaultNewAppointmentStatus: DefaultAppointmentStatus;
  processingFreesProvider: boolean;
}

/* ================================================================== */
/*  Defaults                                                           */
/* ================================================================== */

export const DEFAULT_PREFERENCES: CalendarPreferences = {
  highContrast: false,
  showCanceled: true,
  compactMode: false,
  showAppointmentIcons: true,
  showPrices: false,
  showClientPhone: true,
  colorBy: "status",
  timeIncrementMinutes: 15,
  scrollToNow: true,
  workdayStartHour: 8,
  workdayEndHour: 20,
  showProcessingAndBuffer: true,
  defaultNewAppointmentStatus: "confirmed",
  processingFreesProvider: false,
};

const STORAGE_KEY = "@beautonomi/calendar-preferences";

/* ================================================================== */
/*  Hook                                                               */
/* ================================================================== */

export function useCalendarPreferences() {
  const [preferences, setPreferences] =
    useState<CalendarPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<CalendarPreferences>;
            setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
          } catch {
            // corrupt data — use defaults
          }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  // Persist whenever preferences change (skip initial load)
  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)).catch(
        () => {},
      );
    }
  }, [preferences, loaded]);

  const updatePreference = useCallback(
    <K extends keyof CalendarPreferences>(
      key: K,
      value: CalendarPreferences[K],
    ) => {
      setPreferences((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetToDefaults = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  return { preferences, updatePreference, resetToDefaults, loaded };
}
