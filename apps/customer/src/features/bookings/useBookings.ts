/**
 * useBookings – parity hook for bookings list.
 * Contract: /api/me/bookings
 * Offline: caches last successful list in AsyncStorage; on request failure shows cache if available.
 */
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import type { Booking } from "@/types/api";

const CACHE_KEY_PREFIX = "beautonomi_bookings_";

type BookingsStatus = "upcoming" | "past" | "cancelled";

interface BookingsResponse {
  data?: Booking[];
  items?: Booking[];
}

export function useBookings(status?: BookingsStatus) {
  const [data, setData] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${status ?? "all"}`;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setFromCache(false);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const res = await api.get<BookingsResponse | Booking[]>(
      `/api/me/bookings?${params.toString()}`
    );
    if (res.error) {
      const msg = getApiErrorMessage(res.error, "Failed to load bookings");
      setError(msg);
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Booking[];
          if (Array.isArray(parsed)) {
            setData(parsed);
            setFromCache(true);
          } else setData(null);
        } else setData(null);
      } catch {
        setData(null);
      }
    } else {
      const body = res.data as BookingsResponse | Booking[] | undefined;
      const items = Array.isArray(body)
        ? body
        : (body as BookingsResponse)?.data ?? (body as BookingsResponse)?.items ?? [];
      const list = Array.isArray(items) ? items : [];
      setData(list);
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(list));
      } catch {}
    }
    setLoading(false);
    setRefreshing(false);
  }, [status, cacheKey]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Booking[];
          if (Array.isArray(parsed)) setData(parsed);
        }
      } catch {}
    })();
    load();
  }, [load, cacheKey]);

  return { data: data ?? [], loading, refreshing, error, fromCache, refetch: () => load(true) };
}
