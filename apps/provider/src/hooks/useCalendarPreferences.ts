import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";

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
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  // Load: try server first, fall back to AsyncStorage
  useEffect(() => {
    let cancelled = false;

    async function load() {
      let serverPrefs: Partial<CalendarPreferences> | null = null;

      try {
        const res = await api.get<CalendarPreferences>("/api/provider/settings/calendar-preferences");
        if (res.data && !res.error) {
          serverPrefs = res.data;
        }
      } catch {
        // Server unavailable — fall back to local cache
      }

      if (cancelled) return;

      if (serverPrefs) {
        const merged = { ...DEFAULT_PREFERENCES, ...serverPrefs };
        setPreferences(merged);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
      } else {
        const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (raw && !cancelled) {
          try {
            const parsed = JSON.parse(raw) as Partial<CalendarPreferences>;
            setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
          } catch {
            // corrupt — use defaults
          }
        }
      }

      if (!cancelled) {
        isInitialLoad.current = false;
        setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Persist locally + debounced sync to server when preferences change after initial load
  useEffect(() => {
    if (!loaded || isInitialLoad.current) return;

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)).catch(() => {});

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      api.patch("/api/provider/settings/calendar-preferences", preferences as unknown as Record<string, unknown>).catch(() => {});
    }, 1500);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
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
