import { useState, useCallback } from "react";
import { useApiMutation } from "@/hooks/useApi";
import {
  dbTargetToPatchStatusField,
  optimisticBookingFieldsForDbTarget,
} from "@/lib/provider-booking-status-transitions";
import type { Booking } from "@/components/calendar/calendar-booking-types";

export interface UseProviderCalendarActionsOptions {
  bookings: Booking[] | null;
  mutateBookings: (data: Booking[]) => void;
  refresh: () => Promise<void>;
}

export function useProviderCalendarActions({
  bookings,
  mutateBookings,
  refresh,
}: UseProviderCalendarActionsOptions) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pendingRescheduleIds, setPendingRescheduleIds] = useState<Set<string>>(new Set());

  const { execute: postAction } = useApiMutation<unknown>("post");
  const { execute: patchBookingMutation } = useApiMutation<unknown>("patch");
  const { execute: postTimeBlock } = useApiMutation<unknown>("post");
  const { execute: deleteTimeBlock } = useApiMutation<unknown>("delete");
  const { execute: putAvailability } = useApiMutation<unknown>("put");
  const { execute: deleteAvailability } = useApiMutation<unknown>("delete");

  const optimisticallyUpdateBooking = useCallback(
    (bookingId: string, update: Partial<Booking>): Booking[] | null => {
      if (!bookings) return null;
      const next = bookings.map((b) => (b.id === bookingId ? { ...b, ...update } : b));
      mutateBookings(next);
      return bookings;
    },
    [bookings, mutateBookings],
  );

  const applyStatus = useCallback(
    async (bookingId: string, dbTarget: string, reason?: string): Promise<{ error: string | null }> => {
      setPendingIds((prev) => new Set(prev).add(bookingId));
      const patchStatus = dbTargetToPatchStatusField(dbTarget);
      const previousBookings = optimisticallyUpdateBooking(
        bookingId,
        optimisticBookingFieldsForDbTarget(dbTarget),
      );
      try {
        if (dbTarget === "completed") {
          const res = await postAction(`/api/provider/bookings/${bookingId}/complete-service`, {});
          if (res.error) {
            if (previousBookings) mutateBookings(previousBookings);
            await refresh();
            return { error: res.error };
          }
          await refresh();
          return { error: null };
        }
        if (dbTarget === "in_progress") {
          const res = await postAction(`/api/provider/bookings/${bookingId}/start-service`, {});
          if (res.error) {
            if (previousBookings) mutateBookings(previousBookings);
            await refresh();
            return { error: res.error };
          }
          await refresh();
          return { error: null };
        }
        const body: Record<string, unknown> = { status: patchStatus };
        if (dbTarget === "cancelled" && reason) body.cancellation_reason = reason;
        const res = await patchBookingMutation(`/api/provider/bookings/${bookingId}`, body);
        if (res.error) {
          if (previousBookings) mutateBookings(previousBookings);
          await refresh();
          return { error: res.error };
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
    [optimisticallyUpdateBooking, postAction, patchBookingMutation, mutateBookings, refresh],
  );

  const rescheduleBooking = useCallback(
    async (
      bookingId: string,
      newScheduledAt: string,
      newStaffId?: string,
    ): Promise<{ error: string | null }> => {
      setPendingRescheduleIds((prev) => new Set(prev).add(bookingId));
      try {
        const body: Record<string, unknown> = { scheduled_at: newScheduledAt };
        if (newStaffId) body.staff_id = newStaffId;
        const res = await patchBookingMutation(`/api/provider/bookings/${bookingId}`, body);
        await refresh();
        return { error: res.error ?? null };
      } finally {
        setPendingRescheduleIds((prev) => {
          const next = new Set(prev);
          next.delete(bookingId);
          return next;
        });
      }
    },
    [patchBookingMutation, refresh],
  );

  const createTimeBlock = useCallback(
    async (form: Record<string, unknown>): Promise<{ error: string | null }> => {
      const res = await postTimeBlock("/api/provider/time-blocks", form);
      if (!res.error) await refresh();
      return { error: res.error ?? null };
    },
    [postTimeBlock, refresh],
  );

  const removeTimeBlock = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      const res = await deleteTimeBlock(`/api/provider/time-blocks/${id}`, undefined);
      if (!res.error) await refresh();
      return { error: res.error ?? null };
    },
    [deleteTimeBlock, refresh],
  );

  const editAvailabilityBlock = useCallback(
    async (id: string, data: Record<string, unknown>): Promise<{ error: string | null }> => {
      const res = await putAvailability(`/api/provider/availability-blocks/${id}`, data);
      if (!res.error) await refresh();
      return { error: res.error ?? null };
    },
    [putAvailability, refresh],
  );

  const removeAvailabilityBlock = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      const res = await deleteAvailability(`/api/provider/availability-blocks/${id}`, undefined);
      if (!res.error) await refresh();
      return { error: res.error ?? null };
    },
    [deleteAvailability, refresh],
  );

  return {
    applyStatus,
    rescheduleBooking,
    createTimeBlock,
    removeTimeBlock,
    editAvailabilityBlock,
    removeAvailabilityBlock,
    pendingIds,
    pendingRescheduleIds,
  };
}
