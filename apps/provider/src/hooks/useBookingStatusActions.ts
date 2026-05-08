import { useState, useCallback } from "react";
import { useApiMutation } from "@/hooks/useApi";
import { dbTargetToPatchStatusField } from "@/lib/provider-booking-status-transitions";

export interface UseBookingStatusActionsOptions<T extends { id: string; status: string }> {
  bookings: T[] | null;
  mutate: (next: T[] | null) => void;
  refresh: () => Promise<void>;
}

/**
 * Inline booking status transitions (confirm, check-in, start, complete) with
 * optimistic UI and rollback on API error.
 */
export function useBookingStatusActions<T extends { id: string; status: string }>({
  bookings,
  mutate,
  refresh,
}: UseBookingStatusActionsOptions<T>) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const { execute: postAction } = useApiMutation<unknown>("post");
  const { execute: patchBookingMutation } = useApiMutation<unknown>("patch");

  const applyStatus = useCallback(
    async (bookingId: string, dbTarget: string): Promise<{ error: string | null }> => {
      setPendingIds((prev) => new Set(prev).add(bookingId));
      const previousBookings = bookings;
      if (bookings) {
        mutate(
          bookings.map((b) =>
            b.id === bookingId ? ({ ...b, status: dbTarget } as T) : b,
          ),
        );
      }
      try {
        if (dbTarget === "completed") {
          const res = await postAction(`/api/provider/bookings/${bookingId}/complete-service`, {});
          if (res.error) {
            if (previousBookings) mutate(previousBookings);
            await refresh();
            return { error: res.error };
          }
          await refresh();
          return { error: null };
        }
        if (dbTarget === "in_progress") {
          const res = await postAction(`/api/provider/bookings/${bookingId}/start-service`, {});
          if (res.error) {
            if (previousBookings) mutate(previousBookings);
            await refresh();
            return { error: res.error };
          }
          await refresh();
          return { error: null };
        }
        const body: Record<string, unknown> = { status: dbTargetToPatchStatusField(dbTarget) };
        const res = await patchBookingMutation(`/api/provider/bookings/${bookingId}`, body);
        if (res.error) {
          if (previousBookings) mutate(previousBookings);
          await refresh();
          return { error: res.error ?? null };
        }
        await refresh();
        return { error: null };
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(bookingId);
          return next;
        });
      }
    },
    [bookings, mutate, refresh, postAction, patchBookingMutation],
  );

  return { applyStatus, pendingIds };
}
