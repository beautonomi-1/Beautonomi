import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CalendarFilters } from "@/features/calendar/types/filters";
import { DEFAULT_CALENDAR_FILTERS } from "@/features/calendar/types/filters";

const FILTER_STORAGE_KEY = "@beautonomi/calendar-filters-v2";

export function useProviderCalendarFilters(globalLocationId: string | null) {
  const [filters, setFiltersState] = useState<CalendarFilters>({
    ...DEFAULT_CALENDAR_FILTERS,
    locationFilter: globalLocationId ?? "all",
  });
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FILTER_STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<CalendarFilters>;
          setFiltersState((prev) => ({
            ...prev,
            ...(typeof parsed.staffFilter === "string" && { staffFilter: parsed.staffFilter }),
            ...(typeof parsed.locationFilter === "string" && { locationFilter: parsed.locationFilter }),
            ...(Array.isArray(parsed.statusFilters) && { statusFilters: parsed.statusFilters }),
            ...(typeof parsed.paymentFilter === "string" && { paymentFilter: parsed.paymentFilter as CalendarFilters["paymentFilter"] }),
            ...(typeof parsed.showAtHome === "boolean" && { showAtHome: parsed.showAtHome }),
          }));
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync location from prop
  useEffect(() => {
    setFiltersState((prev) => ({
      ...prev,
      locationFilter: globalLocationId ?? "all",
    }));
  }, [globalLocationId]);

  // Persist to AsyncStorage whenever filters change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters)).catch(() => {});
  }, [filters, hydrated]);

  const setStaffFilter = useCallback((v: string) => {
    setFiltersState((prev) => ({ ...prev, staffFilter: v }));
  }, []);

  const setLocationFilter = useCallback((v: string) => {
    setFiltersState((prev) => ({ ...prev, locationFilter: v }));
  }, []);

  const setStatusFilters = useCallback((v: string[]) => {
    setFiltersState((prev) => ({ ...prev, statusFilters: v }));
  }, []);

  const setPaymentFilter = useCallback((v: CalendarFilters["paymentFilter"]) => {
    setFiltersState((prev) => ({ ...prev, paymentFilter: v }));
  }, []);

  const setShowAtHome = useCallback((v: boolean) => {
    setFiltersState((prev) => ({ ...prev, showAtHome: v }));
  }, []);

  const updateFilters = useCallback((patch: Partial<CalendarFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({
      ...DEFAULT_CALENDAR_FILTERS,
      locationFilter: globalLocationId ?? "all",
    });
  }, [globalLocationId]);

  return {
    filters,
    staffFilter: filters.staffFilter,
    locationFilter: filters.locationFilter,
    statusFilters: filters.statusFilters,
    paymentFilter: filters.paymentFilter,
    showAtHome: filters.showAtHome,
    setStaffFilter,
    setLocationFilter,
    setStatusFilters,
    setPaymentFilter,
    setShowAtHome,
    updateFilters,
    resetFilters,
    hydrated,
  };
}
