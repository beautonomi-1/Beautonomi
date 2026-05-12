import { useState, useCallback } from "react";
import { useApiMutation } from "@/hooks/useApi";
import {
  dbTargetToPatchStatusField,
  optimisticBookingFieldsForDbTarget,
} from "@/lib/provider-booking-status-transitions";
import type { ProviderBookingAction } from "@/lib/provider-booking-action-policy";

export interface UseBookingStatusActionsOptions<T extends { id: string; status: string }> {
  bookings: T[] | null;
  mutate: (next: T[] | null) => void;
  refresh: () => Promise<void>;
}

/** Inputs accepted by `applyStatus` — either a raw DB target string (legacy)
 * or a full action object emitted by `buildProviderBookingActionModel`.
 *
 * House-call journey actions (`start_journey`, `mark_arrived`) and other
 * post-actions (`start_service`, `complete_service`) have their own POST
 * routes that are distinct from the generic `bookings/[id]` PATCH. Passing the
 * full action lets the hook route to the right endpoint without trying to
 * derive it from `dbTarget` alone (which is ambiguous for journey actions
 * since they share `dbTarget: "confirmed"`).
 */
export type ApplyStatusInput = string | ProviderBookingAction;

/**
 * Inline booking status transitions (confirm, check-in, start journey, mark
 * arrived, start service, complete) with optimistic UI and rollback on error.
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
    async (
      bookingId: string,
      input: ApplyStatusInput,
    ): Promise<{ error: string | null; errorCode?: string | null }> => {
      const action: ProviderBookingAction | null = typeof input === "string" ? null : input;
      const dbTarget = typeof input === "string" ? input : input.dbTarget;

      setPendingIds((prev) => new Set(prev).add(bookingId));
      const previousBookings = bookings;
      // Only apply optimistic status overlay for actions that genuinely change `bookings.status`.
      // Journey actions (`start_journey`, `mark_arrived`) leave the status as `confirmed/booked` —
      // they only advance `current_stage`, so an optimistic status update would be a lie.
      const updatesStatus =
        !action ||
        action.kind === "patch-status" ||
        action.id === "start_service" ||
        action.id === "complete_service";

      if (bookings && updatesStatus) {
        mutate(
          bookings.map((b) =>
            b.id === bookingId ? ({ ...b, ...optimisticBookingFieldsForDbTarget(dbTarget) } as T) : b,
          ),
        );
      }
      try {
        // Action-driven routing: the action object knows exactly which endpoint to call.
        if (action && action.kind === "post-action" && action.route) {
          const res = await postAction(action.route, action.payload ?? {});
          if (res.error) {
            if (previousBookings && updatesStatus) mutate(previousBookings);
            await refresh();
            return { error: res.error, errorCode: res.errorCode };
          }
          await refresh();
          return { error: null };
        }

        if (dbTarget === "completed") {
          const res = await postAction(`/api/provider/bookings/${bookingId}/complete-service`, {});
          if (res.error) {
            if (previousBookings) mutate(previousBookings);
            await refresh();
            return { error: res.error, errorCode: res.errorCode };
          }
          await refresh();
          return { error: null };
        }
        if (dbTarget === "in_progress") {
          const res = await postAction(`/api/provider/bookings/${bookingId}/start-service`, {});
          if (res.error) {
            if (previousBookings) mutate(previousBookings);
            await refresh();
            return { error: res.error, errorCode: res.errorCode };
          }
          await refresh();
          return { error: null };
        }
        const body: Record<string, unknown> = action?.payload ?? {
          status: dbTargetToPatchStatusField(dbTarget),
        };
        const res = await patchBookingMutation(`/api/provider/bookings/${bookingId}`, body);
        if (res.error) {
          if (previousBookings) mutate(previousBookings);
          await refresh();
          return { error: res.error ?? null, errorCode: res.errorCode };
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
