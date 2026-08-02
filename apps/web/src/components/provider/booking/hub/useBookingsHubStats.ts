"use client";

import { useCallback, useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";

export type BookingsHubStats = {
  appointment_count: number;
  booked_gmv: number;
  pending_count: number;
  confirmed_count?: number;
  in_progress_count: number;
  completed_count?: number;
  cancelled_count?: number;
  no_show_count?: number;
  recognized_revenue?: number;
};

export function useBookingsHubStats(range: "today" | "week" | "month" | "all", locationId?: string) {
  const [stats, setStats] = useState<BookingsHubStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range });
      if (locationId) params.set("location_id", locationId);
      const res = await fetcher.get<{ data?: BookingsHubStats }>(
        `/api/provider/bookings/stats?${params}`,
      );
      const data = res?.data;
      if (data) {
        setStats({
          appointment_count: data.appointment_count ?? 0,
          booked_gmv: data.booked_gmv ?? 0,
          pending_count: data.pending_count ?? 0,
          confirmed_count: data.confirmed_count ?? 0,
          in_progress_count: data.in_progress_count ?? 0,
          completed_count: data.completed_count ?? 0,
          cancelled_count: data.cancelled_count ?? 0,
          no_show_count: data.no_show_count ?? 0,
          recognized_revenue: data.recognized_revenue,
        });
      }
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [range, locationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
