/**
 * useBookings – parity hook for bookings list.
 * Contract: /api/me/bookings
 * Offline: caches last successful list in AsyncStorage; on request failure shows cache if available.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import type { Booking } from "@/types/api";
import { useAuth } from "@/providers/AuthProvider";
import { getRuntimeMarketHost } from "@/config/public-env";
import {
  BOOKINGS_CACHE_KEY_PREFIX,
  LEGACY_BOOKINGS_CACHE_KEY_PREFIX,
} from "@/lib/cache-keys";

type BookingsStatus = "upcoming" | "past" | "cancelled";

interface BookingsResponse {
  data?: Booking[];
  items?: Booking[];
}

function extractBookingsList(body: BookingsResponse | Booking[] | null | undefined): Booking[] {
  if (body == null) return [];
  if (Array.isArray(body)) return body;
  const items = body.items ?? body.data;
  return Array.isArray(items) ? items : [];
}

export function useBookings(status?: BookingsStatus) {
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
    ? `${BOOKINGS_CACHE_KEY_PREFIX}:${host}:${user.id}:${status ?? "all"}`
    : `${LEGACY_BOOKINGS_CACHE_KEY_PREFIX}${status ?? "all"}`;

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

      const params = new URLSearchParams();
      if (status) params.set("status", status);
      // Default API limit is 20; tabs need enough rows for active customers.
      params.set("limit", "100");
      params.set("page", "1");

      try {
        const res = await api.get<BookingsResponse | Booking[]>(
          `/api/me/bookings?${params.toString()}`,
        );
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
          const list = extractBookingsList(res.data as BookingsResponse | Booking[] | undefined);
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
    [status, cacheKey, user?.id],
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
