import { useMemo } from "react";
import { useApi } from "@/hooks/useApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  buildAvailableSlotsUrl,
  normalizeSlotRows,
  type BookingSlotRow,
} from "@/lib/booking-date-time-helpers";

export type BookingSlotsQueryParams = {
  date: string;
  duration_minutes: number;
  staff_ids?: string;
  location_id?: string;
  service_ids?: string;
  mode?: string;
  travel_buffer?: number;
  exclude_booking_id?: string;
  exclude_group_booking_id?: string;
};

type SlotsApiResponse = {
  slots?: string[];
  slot_grid?: BookingSlotRow[];
  provider_timezone?: string | null;
};

export function useBookingAvailableSlots(
  params: BookingSlotsQueryParams | null,
  options?: { enabled?: boolean; debounceMs?: number },
) {
  const enabled = options?.enabled ?? true;
  const debouncedParams = useDebouncedValue(params, options?.debounceMs ?? 280);

  const url = useMemo(() => {
    if (!enabled || !debouncedParams?.date) return "";
    return buildAvailableSlotsUrl(debouncedParams);
  }, [debouncedParams, enabled]);

  const { data, loading, refresh, error } = useApi<SlotsApiResponse>(url, {
    enabled: enabled && url.length > 0,
  });

  const rows = useMemo(() => normalizeSlotRows(data), [data]);
  const providerTimezone =
    typeof data?.provider_timezone === "string" && data.provider_timezone.trim().length > 0
      ? data.provider_timezone.trim()
      : null;

  const queryDate = params?.date ?? "";
  const debouncedDate = debouncedParams?.date ?? "";
  const isDebouncing = enabled && queryDate !== debouncedDate;
  const isUpdating = loading || isDebouncing;

  const showStaleRows = isUpdating && rows.length > 0 && queryDate !== debouncedDate;
  const displayRows = showStaleRows ? [] : rows;

  return {
    rows: displayRows,
    allRows: rows,
    loading: isUpdating,
    isDebouncing,
    providerTimezone,
    refresh,
    error,
    slotsData: data,
    activeDate: debouncedDate,
  };
}
