/**
 * useBookings – parity hook for bookings list.
 * Contract: /api/me/bookings
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { Booking } from "@/types/api";

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

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const res = await api.get<BookingsResponse | Booking[]>(
      `/api/me/bookings?${params.toString()}`
    );
    if (res.error) {
      setError(res.error.message);
      setData(null);
    } else {
      const body = res.data as BookingsResponse | Booking[] | undefined;
      const items = Array.isArray(body)
        ? body
        : (body as BookingsResponse)?.data ?? (body as BookingsResponse)?.items ?? [];
      setData(Array.isArray(items) ? items : []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  return { data: data ?? [], loading, refreshing, error, refetch: () => load(true) };
}
