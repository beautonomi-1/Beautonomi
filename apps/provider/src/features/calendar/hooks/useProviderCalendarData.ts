import { usePagedProviderBookings } from "@/hooks/usePagedProviderBookings";

export function useProviderCalendarData<T extends { id?: string }>(
  path: string,
  options?: { enabled?: boolean; timeoutMs?: number },
) {
  return usePagedProviderBookings<T>(path, options);
}
