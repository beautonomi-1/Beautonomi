import { useMemo, useCallback } from "react";
import { useApi } from "@/hooks/useApi";
import { expandTimeBlocksForCalendarRange, resolveTimeBlockRecordId } from "@/lib/expand-time-blocks";
import { mergeOperatingHours } from "@beautonomi/utils";
import { normalizeAvailabilityBlocksToSegments, availabilitySegmentToTimeBlock } from "@/features/calendar/utils/overlays";
import type { AvailabilityBlockApi, CalendarOverlayTimeBlockLike } from "@/features/calendar/utils/overlays";

export { resolveTimeBlockRecordId };

interface UseProviderCalendarOverlaysOptions {
  startDate: string;
  endDate: string;
  locationFilter: string;
  secondaryEnabled: boolean;
  providerTimezone: string | null;
  providerShiftsEnabled?: boolean;
}

export function useProviderCalendarOverlays({
  startDate,
  endDate,
  locationFilter,
  secondaryEnabled,
  providerTimezone,
}: UseProviderCalendarOverlaysOptions) {
  const locParam = locationFilter !== "all" ? `&location_id=${locationFilter}` : "";

  const { data: staff, refresh: refreshStaff } = useApi<{ id: string; name: string; avatar_url?: string | null; working_hours?: Record<string, unknown> | null }[]>("/api/provider/team", { staleTimeMs: 60_000 });
  const { data: locations, refresh: refreshLocations } = useApi<{ id: string; name: string; operating_hours?: unknown }[]>("/api/provider/locations", { staleTimeMs: 60_000 });

  const shiftsPath = `/api/provider/shifts?week_start=${startDate}`;
  const { data: primaryShifts, refresh: refreshPrimaryShifts } = useApi<unknown[]>(shiftsPath, { staleTimeMs: 30_000 });

  const timeBlocksPath = `/api/provider/time-blocks?date_from=${startDate}&date_to=${endDate}${locParam}`;
  const { data: rawTimeBlocks, refresh: refreshTimeBlocks } = useApi<CalendarOverlayTimeBlockLike[]>(timeBlocksPath, {
    enabled: secondaryEnabled,
    staleTimeMs: 30_000,
  });

  const availPath = `/api/provider/availability-blocks?from=${startDate}&to=${endDate}${locParam}`;
  const { data: availabilityRaw, refresh: refreshAvailabilityBlocks } = useApi<AvailabilityBlockApi[]>(availPath, {
    enabled: secondaryEnabled,
    staleTimeMs: 30_000,
  });

  const staffUnavailPath = `/api/provider/calendar/staff-unavailability?from=${startDate}&to=${endDate}${locParam}`;
  const { data: staffUnavailRaw, refresh: refreshStaffUnavail } = useApi<AvailabilityBlockApi[]>(staffUnavailPath, {
    enabled: secondaryEnabled,
    staleTimeMs: 30_000,
  });

  const bookingHoldsPath = `/api/provider/calendar/booking-holds?from=${startDate}&to=${endDate}${locParam}`;
  const { data: bookingHoldsRaw, refresh: refreshBookingHolds } = useApi<AvailabilityBlockApi[]>(bookingHoldsPath, {
    enabled: secondaryEnabled,
    staleTimeMs: 30_000,
  });

  const waitingRoomPath = "/api/provider/waiting-room/count";
  const { data: waitingRoomData, refresh: refreshWaitingRoom } = useApi<{ count: number }>(waitingRoomPath, {
    staleTimeMs: 15_000,
  });

  const expandedApiTimeBlocks = useMemo(() => {
    if (!rawTimeBlocks?.length) return [];
    return expandTimeBlocksForCalendarRange(rawTimeBlocks, startDate, endDate);
  }, [rawTimeBlocks, startDate, endDate]);

  const availabilitySegments = useMemo(() => {
    if (!availabilityRaw?.length) return [];
    const normalized = normalizeAvailabilityBlocksToSegments(availabilityRaw, providerTimezone);
    return locationFilter !== "all"
      ? normalized.filter((s) => s.location_id == null || s.location_id === locationFilter)
      : normalized;
  }, [availabilityRaw, providerTimezone, locationFilter]);

  const staffUnavailSegments = useMemo(() => {
    if (!staffUnavailRaw?.length) return [];
    return normalizeAvailabilityBlocksToSegments(staffUnavailRaw, providerTimezone).map((s) => ({
      ...s,
      _source: "staff_unavailability" as const,
    }));
  }, [staffUnavailRaw, providerTimezone]);

  const bookingHoldSegments = useMemo(() => {
    if (!bookingHoldsRaw?.length) return [];
    return normalizeAvailabilityBlocksToSegments(bookingHoldsRaw, providerTimezone);
  }, [bookingHoldsRaw, providerTimezone]);

  const operatingHours = useMemo(() => {
    if (!locations?.length) return null;
    if (locationFilter !== "all") {
      const loc = locations.find((l) => l.id === locationFilter);
      const raw = loc?.operating_hours as unknown;
      if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
      return raw as Record<string, unknown>;
    }
    return mergeOperatingHours(locations.map((l) => l.operating_hours));
  }, [locations, locationFilter]);

  const waitingRoomCount = waitingRoomData?.count ?? 0;

  const refreshCalendarOverlays = useCallback(async () => {
    await Promise.all([
      refreshTimeBlocks(),
      refreshAvailabilityBlocks(),
      refreshStaffUnavail(),
      refreshBookingHolds(),
      refreshWaitingRoom(),
    ]);
  }, [refreshTimeBlocks, refreshAvailabilityBlocks, refreshStaffUnavail, refreshBookingHolds, refreshWaitingRoom]);

  return {
    staff: staff ?? [],
    locations: locations ?? [],
    primaryShifts,
    rawTimeBlocks,
    availabilityRaw,
    expandedApiTimeBlocks,
    availabilitySegments,
    staffUnavailSegments,
    bookingHoldSegments,
    operatingHours,
    waitingRoomCount,
    refreshStaff,
    refreshLocations,
    refreshPrimaryShifts,
    refreshTimeBlocks,
    refreshAvailabilityBlocks,
    refreshCalendarOverlays,
    availabilitySegmentToTimeBlock,
  };
}
