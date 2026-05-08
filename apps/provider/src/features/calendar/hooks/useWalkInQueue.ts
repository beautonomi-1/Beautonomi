import { useApi } from "@/hooks/useApi";
import type { WaitingRoomListEntry } from "@/features/calendar/types/waiting-room";

export function useWalkInQueue(isFocused: boolean, locationId?: string | null) {
  const path =
    locationId && locationId !== "all"
      ? `/api/provider/waiting-room?location_id=${encodeURIComponent(locationId)}`
      : "/api/provider/waiting-room";
  const { data, loading, error, refresh } = useApi<WaitingRoomListEntry[]>(path, {
    enabled: isFocused,
    staleTimeMs: 15_000,
  });
  return {
    entries: data ?? null,
    loading,
    error,
    refresh,
  };
}
