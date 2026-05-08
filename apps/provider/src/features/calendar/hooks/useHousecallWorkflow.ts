import { useCallback, useState } from "react";
import { useApiMutation } from "@/hooks/useApi";

const ROUTES = {
  startJourney: (id: string) => `/api/provider/bookings/${id}/start-journey`,
  arrive: (id: string) => `/api/provider/bookings/${id}/arrive`,
  verifyArrival: (id: string) => `/api/provider/bookings/${id}/verify-arrival`,
  verifyQr: (id: string) => `/api/provider/bookings/${id}/verify-qr`,
} as const;

export function useHousecallWorkflow() {
  const { execute, loading } = useApiMutation("post");
  const [lastError, setLastError] = useState<string | null>(null);

  const runRoute = useCallback(
    async (path: string, body?: Record<string, unknown>) => {
      setLastError(null);
      const res = await execute(path, body);
      if (res.error) {
        setLastError(res.error);
        return { ok: false as const, error: res.error };
      }
      return { ok: true as const, data: res.data };
    },
    [execute],
  );

  return {
    loading,
    lastError,
    startJourney: (bookingId: string) => runRoute(ROUTES.startJourney(bookingId), {}),
    arrive: (bookingId: string) => runRoute(ROUTES.arrive(bookingId), {}),
    verifyArrival: (bookingId: string, body?: Record<string, unknown>) =>
      runRoute(ROUTES.verifyArrival(bookingId), body),
    verifyQr: (bookingId: string, body?: Record<string, unknown>) =>
      runRoute(ROUTES.verifyQr(bookingId), body),
    ROUTES,
  };
}
