"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Appointment } from "@/lib/provider-portal/types";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { mapProviderBookingActionError } from "@beautonomi/provider-booking";
import { getCustomerEtaUiParts } from "@beautonomi/utils";
import {
  buildProviderBookingActionModel,
  type ProviderBookingAction,
} from "@/lib/provider-booking/action-policy";
import { usePermissions } from "@/hooks/usePermissions";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingActionButton, BookingSectionCard, BookingSectionLabel } from "../ui";
import { PermissionGateInline } from "../scenario/PermissionGateInline";
import { BookingErrorBanner } from "../scenario/BookingErrorBanner";
import { BookingCancelDialog } from "./BookingCancelDialog";
import { BookingNoShowDialog } from "./BookingNoShowDialog";
import {
  BookingCompleteConfirmDialog,
  type BookingCompleteConfirmReason,
} from "./BookingCompleteConfirmDialog";
import { EtaPicker } from "../EtaPicker";

interface BookingStatusActionsProps {
  appointment: Appointment;
  onUpdated?: () => void;
  onCompleted?: () => void;
  onCollectPayment?: () => void;
  completionChecklist?: {
    allDone: boolean;
    blockingLabels: string[];
  } | null;
  outstanding?: number;
}

export function BookingStatusActions({
  appointment,
  onUpdated,
  onCompleted,
  onCollectPayment,
  completionChecklist,
  outstanding = 0,
}: BookingStatusActionsProps) {
  const router = useRouter();
  const { format: formatMoney } = useProviderMoneyFormat();
  const { hasPermission, isOwner } = usePermissions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [completeConfirmReason, setCompleteConfirmReason] =
    useState<BookingCompleteConfirmReason>("checklist");
  const [completeConfirmMessage, setCompleteConfirmMessage] = useState("");
  const [journeyEtaMinutes, setJourneyEtaMinutes] = useState<number | null>(15);
  const [updateEtaMinutes, setUpdateEtaMinutes] = useState<number | null>(15);
  const [isUpdatingEta, setIsUpdatingEta] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const canEdit = isOwner || hasPermission("edit_appointments");
  const canCancel = isOwner || hasPermission("cancel_appointments") || canEdit;

  const raw = appointment as unknown as Record<string, unknown>;
  const version = typeof raw.version === "number" ? raw.version : undefined;

  const model = buildProviderBookingActionModel({
    id: appointment.id,
    status: appointment.status,
    db_status: raw.db_status as string | undefined,
    payment_status: appointment.payment_status,
    scheduled_at: raw.scheduled_at as string | undefined,
    location_type: appointment.location_type,
    location_id: appointment.location_id,
    current_stage: raw.current_stage as string | undefined,
    arrival_otp_verified: raw.arrival_otp_verified as boolean | undefined,
    qr_code_verified: raw.qr_code_verified as boolean | undefined,
    arrival_otp_pending: raw.arrival_otp_pending as boolean | undefined,
    qr_arrival_pending: raw.qr_arrival_pending as boolean | undefined,
  });

  const actionAllowed = (action: ProviderBookingAction) => {
    if (action.id === "cancel" || action.id === "mark_no_show") return canCancel;
    return canEdit;
  };

  const postCompleteService = useCallback(async () => {
    setBusy("complete_service");
    setError(null);
    try {
      await fetcher.post(`/api/provider/bookings/${appointment.id}/complete-service`, {});
      toast.success("Service completed");
      setCompleteConfirmOpen(false);
      onCompleted?.();
      onUpdated?.();
    } catch (err) {
      const fetchErr = err instanceof FetchError ? err : null;
      const msg = mapProviderBookingActionError(
        err instanceof Error ? err.message : "Failed to complete service",
        fetchErr?.code,
      );
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }, [appointment.id, onCompleted, onUpdated]);

  const beginCompleteService = useCallback(() => {
    const paymentStatus = (appointment.payment_status ?? "").toLowerCase();
    if (paymentStatus === "refunded") {
      setCompleteConfirmReason("refunded");
      setCompleteConfirmMessage(
        "This booking was fully refunded. Cancel it instead of marking completed.",
      );
      setCompleteConfirmOpen(true);
      return;
    }

    if (completionChecklist && !completionChecklist.allDone) {
      setCompleteConfirmReason("checklist");
      setCompleteConfirmMessage(
        `${completionChecklist.blockingLabels.join(" · ")}\n\nFinish these steps or choose Complete anyway.`,
      );
      setCompleteConfirmOpen(true);
      return;
    }

    if (outstanding > 0) {
      setCompleteConfirmReason("outstanding");
      setCompleteConfirmMessage(
        "Capture payment before completing, or choose Complete anyway to settle later.",
      );
      setCompleteConfirmOpen(true);
      return;
    }

    void postCompleteService();
  }, [appointment.payment_status, completionChecklist, outstanding, postCompleteService]);

  const runAction = useCallback(
    async (action: ProviderBookingAction) => {
      if (!actionAllowed(action)) {
        toast.error("You do not have permission for this action");
        return;
      }

      setBusy(action.id);
      setError(null);

      try {
        const bookingId = appointment.id;

        if (action.id === "cancel") {
          setCancelOpen(true);
          setBusy(null);
          return;
        }

        if (action.id === "mark_no_show") {
          setNoShowOpen(true);
          setBusy(null);
          return;
        }

        if (action.id === "complete_service") {
          setBusy(null);
          beginCompleteService();
          return;
        }

        if (action.id === "start_journey") {
          const payload =
            journeyEtaMinutes != null ? { eta_minutes: journeyEtaMinutes } : {};
          await fetcher.post(`/api/provider/bookings/${bookingId}/start-journey`, payload);
          toast.success("Journey started");
          onUpdated?.();
          return;
        }
        if (action.id === "mark_arrived") {
          await fetcher.post(`/api/provider/bookings/${bookingId}/arrive`, {});
          toast.success("Arrival marked");
          onUpdated?.();
          return;
        }
        if (action.id === "start_service") {
          await fetcher.post(`/api/provider/bookings/${bookingId}/start-service`, {});
          toast.success("Service started");
          onUpdated?.();
          return;
        }

        const statusTarget =
          action.id === "check_in"
            ? "checked_in"
            : action.dbTarget;

        const response = await fetcher.patch<{ booking: unknown; conflict?: boolean }>(
          `/api/provider/bookings/${bookingId}`,
          { status: statusTarget, version },
        );

        if (response.conflict) {
          const msg = mapProviderBookingActionError(null, "CONFLICT");
          setError(msg);
          toast.error(msg);
          return;
        }

        toast.success("Booking status updated");
        onUpdated?.();
      } catch (err) {
        const fetchErr = err instanceof FetchError ? err : null;
        const msg = mapProviderBookingActionError(
          err instanceof Error ? err.message : "Failed to update status",
          fetchErr?.code,
        );
        setError(msg);
        toast.error(msg);
      } finally {
        setBusy(null);
      }
    },
    [appointment.id, beginCompleteService, journeyEtaMinutes, onUpdated, version, canCancel, canEdit],
  );

  const visibleActions = model.actions.filter(actionAllowed);
  const primary = model.primaryAction && actionAllowed(model.primaryAction) ? model.primaryAction : null;
  const secondary = visibleActions.filter((a) => a.id !== primary?.id);
  const currentStage = typeof raw.current_stage === "string" ? raw.current_stage : undefined;
  const estimatedArrival =
    appointment.estimated_arrival ??
    (typeof raw.estimated_arrival === "string" ? raw.estimated_arrival : null);
  const etaParts = getCustomerEtaUiParts(estimatedArrival);
  const isEnRoute = currentStage === "provider_on_way";
  const isLate = isEnRoute && etaParts.isLate;
  void nowMs;

  const handleUpdateEta = async () => {
    setIsUpdatingEta(true);
    setError(null);
    try {
      await fetcher.patch(`/api/provider/bookings/${appointment.id}/eta`, {
        eta_minutes: updateEtaMinutes,
      });
      toast.success("ETA updated");
      onUpdated?.();
    } catch (err) {
      const fetchErr = err instanceof FetchError ? err : null;
      const msg = mapProviderBookingActionError(
        err instanceof Error ? err.message : "Failed to update ETA",
        fetchErr?.code,
      );
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUpdatingEta(false);
    }
  };

  if (!canEdit && !canCancel) {
    return (
      <PermissionGateInline
        allowed={false}
        message="You do not have permission to update booking status."
      >
        {null}
      </PermissionGateInline>
    );
  }

  if (visibleActions.length === 0) return null;

  return (
    <>
      <BookingSectionCard>
        <BookingSectionLabel className="mb-1">{model.stepTitle}</BookingSectionLabel>
        {model.stepDescription ? (
          <p className="text-xs text-gray-500 mb-3">{model.stepDescription}</p>
        ) : null}

        {error ? <BookingErrorBanner message={error} onDismiss={() => setError(null)} className="mb-3" /> : null}

        {appointment.location_type === "at_home" &&
        model.primaryAction?.id === "start_journey" ? (
          <EtaPicker
            value={journeyEtaMinutes}
            onChange={setJourneyEtaMinutes}
            disabled={busy != null}
            className="mb-3"
          />
        ) : null}

        {appointment.location_type === "at_home" && isEnRoute ? (
          <div className="mb-3 space-y-2">
            {isLate ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                You&apos;re past the estimated arrival. Update your ETA so the client knows you&apos;re
                running a little late.
              </p>
            ) : null}
            <EtaPicker
              value={updateEtaMinutes}
              onChange={setUpdateEtaMinutes}
              disabled={isUpdatingEta || busy != null}
            />
            <BookingActionButton
              size="sm"
              fullWidth={false}
              variant="outline"
              disabled={isUpdatingEta || busy != null || updateEtaMinutes == null}
              onClick={() => void handleUpdateEta()}
            >
              {isUpdatingEta ? "Updating ETA…" : "Update ETA"}
            </BookingActionButton>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {primary ? (
            <BookingActionButton
              disabled={busy != null}
              onClick={() => void runAction(primary)}
              data-testid={primary.id === "complete_service" ? "booking-complete-service" : undefined}
            >
              {busy === primary.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                primary.label
              )}
            </BookingActionButton>
          ) : null}

          {secondary.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {secondary.map((action) => (
                <BookingActionButton
                  key={action.id}
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  disabled={busy != null}
                  onClick={() => void runAction(action)}
                >
                  {busy === action.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    action.label
                  )}
                </BookingActionButton>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="text-xs text-gray-500 underline underline-offset-2 self-start mt-1"
            onClick={() => router.push(`/provider/bookings/${appointment.id}`)}
          >
            Open full booking page
          </button>
        </div>
      </BookingSectionCard>

      <BookingCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        appointment={appointment}
        version={version}
        onSuccess={onUpdated}
      />

      <BookingNoShowDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        appointment={appointment}
        version={version}
        onSuccess={onUpdated}
      />

      <BookingCompleteConfirmDialog
        open={completeConfirmOpen}
        onOpenChange={setCompleteConfirmOpen}
        reason={completeConfirmReason}
        message={completeConfirmMessage}
        outstandingLabel={outstanding > 0 ? formatMoney(outstanding) : undefined}
        busy={busy === "complete_service"}
        onCollectPayment={
          onCollectPayment
            ? () => {
                setCompleteConfirmOpen(false);
                onCollectPayment();
              }
            : undefined
        }
        onCompleteAnyway={() => void postCompleteService()}
        onCancelBooking={
          completeConfirmReason === "refunded"
            ? () => {
                setCompleteConfirmOpen(false);
                setCancelOpen(true);
              }
            : undefined
        }
      />
    </>
  );
}
