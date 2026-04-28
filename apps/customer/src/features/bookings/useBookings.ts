/**
 * useBookings – parity hook for bookings list.
 * Contract: /api/me/bookings
 * Offline: caches last successful list in AsyncStorage; on request failure shows cache if available.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiErrorMessage } from "@/lib/api-error";
import type { Booking } from "@/types/api";
import { useAuth } from "@/providers/AuthProvider";
import { getRuntimeMarketHost } from "@/config/public-env";
import {
  BOOKINGS_CACHE_KEY_PREFIX,
  LEGACY_BOOKINGS_CACHE_KEY_PREFIX,
} from "@/lib/cache-keys";
import {
  fetchAllBookingsPages,
  type CustomerBookingsSortBy,
  type CustomerBookingsSortDir,
} from "@/features/bookings/fetchAllBookingsPages";

type BookingsStatus = "upcoming" | "past" | "cancelled";

export type MeBookingsSortBy = CustomerBookingsSortBy;
export type MeBookingsSortDir = CustomerBookingsSortDir;

export interface UseBookingsOptions {
  sortBy?: MeBookingsSortBy;
  sortDir?: MeBookingsSortDir;
}

export function useBookings(status?: BookingsStatus, options?: UseBookingsOptions) {
  const sortBy = options?.sortBy ?? "scheduled_at";
  const sortDir = options?.sortDir ?? "desc";
  const { user } = useAuth();
  const [data, setData] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  /** Bumps on each load; responses from older generations are ignored (fixes tab-switch races). */
  const requestGeneration = useRef(0);

  const host = getRuntimeMarketHost().trim().toLowerCase() || "default";
  const cacheKey = user?.id
    ? `${BOOKINGS_CACHE_KEY_PREFIX}:${host}:${user.id}:${status ?? "all"}:${sortBy}:${sortDir}`
    : `${LEGACY_BOOKINGS_CACHE_KEY_PREFIX}${status ?? "all"}:${sortBy}:${sortDir}`;

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) {
        setData([]);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        setFromCache(false);
        return;
      }

      const gen = ++requestGeneration.current;

      if (isRefresh) {
        setRefreshing(true);
        setError(null);
        setFromCache(false);
      } else {
        setLoading(true);
        setError(null);
        setFromCache(false);
        // Show this tab's cache immediately; never keep rows from another filter while the new request flies.
        try {
          const raw = await AsyncStorage.getItem(cacheKey);
          if (gen !== requestGeneration.current) return;
          if (raw) {
            const parsed = JSON.parse(raw) as Booking[];
            setData(Array.isArray(parsed) ? parsed : []);
          } else {
            setData([]);
          }
        } catch {
          if (gen !== requestGeneration.current) return;
          setData([]);
        }
      }

      try {
        const res = await fetchAllBookingsPages({ status, sortBy, sortDir });
        if (gen !== requestGeneration.current) return;

        if (res.error) {
          const msg = getApiErrorMessage(res.error, "Failed to load bookings");
          setError(msg);
          try {
            const raw = await AsyncStorage.getItem(cacheKey);
            if (gen !== requestGeneration.current) return;
            if (raw) {
              const parsed = JSON.parse(raw) as Booking[];
              if (Array.isArray(parsed)) {
                setData(parsed);
                setFromCache(true);
              } else setData(null);
            } else setData(null);
          } catch {
            if (gen !== requestGeneration.current) return;
            setData(null);
          }
        } else {
          const list = res.data ?? [];
          setData(list);
          try {
            await AsyncStorage.setItem(cacheKey, JSON.stringify(list));
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        if (gen !== requestGeneration.current) return;
        setError(getApiErrorMessage(e, "Failed to load bookings"));
        setData(null);
      } finally {
        if (gen === requestGeneration.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [status, sortBy, sortDir, cacheKey, user?.id],
  );

  useEffect(() => {
    if (!user?.id) {
      setData([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      setFromCache(false);
      return;
    }
    void load(false);
  }, [load, user?.id]);

  return { data: data ?? [], loading, refreshing, error, fromCache, refetch: () => load(true) };
}
