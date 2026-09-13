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
import { shouldSuppressNoShowAfterRunningLate } from "@/lib/bookings/lifecycle-running-late";
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
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
  const [ackBusy, setAckBusy] = useState(false);
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
      toast.success(t("web.provider.bookings.statusActions.serviceCompleted"));
      setCompleteConfirmOpen(false);
      onCompleted?.();
      onUpdated?.();
    } catch (err) {
      const fetchErr = err instanceof FetchError ? err : null;
      const msg = mapProviderBookingActionError(
        err instanceof Error ? err.message : t("web.provider.bookings.statusActions.completeFailed"),
        fetchErr?.code,
      );
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }, [appointment.id, onCompleted, onUpdated, t]);

  const beginCompleteService = useCallback(() => {
    const paymentStatus = (appointment.payment_status ?? "").toLowerCase();
    if (paymentStatus === "refunded") {
      setCompleteConfirmReason("refunded");
      setCompleteConfirmMessage(
        t("web.provider.bookings.statusActions.refundedCompleteHint"),
      );
      setCompleteConfirmOpen(true);
      return;
    }

    if (completionChecklist && !completionChecklist.allDone) {
      setCompleteConfirmReason("checklist");
      setCompleteConfirmMessage(
        t("web.provider.bookings.statusActions.checklistCompleteHint", {
          labels: completionChecklist.blockingLabels.join(" · "),
        }),
      );
      setCompleteConfirmOpen(true);
      return;
    }

    if (outstanding > 0) {
      setCompleteConfirmReason("outstanding");
      setCompleteConfirmMessage(
        t("web.provider.bookings.statusActions.outstandingCompleteHint"),
      );
      setCompleteConfirmOpen(true);
      return;
    }

    void postCompleteService();
  }, [appointment.payment_status, completionChecklist, outstanding, postCompleteService]);

  const runAction = useCallback(
    async (action: ProviderBookingAction) => {
      if (!actionAllowed(action)) {
        toast.error(t("web.provider.bookings.statusActions.noPermission"));
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
          toast.success(t("web.provider.bookings.statusActions.journeyStarted"));
          onUpdated?.();
          return;
        }
        if (action.id === "mark_arrived") {
          await fetcher.post(`/api/provider/bookings/${bookingId}/arrive`, {});
          toast.success(t("web.provider.bookings.statusActions.arrivalMarked"));
          onUpdated?.();
          return;
        }
        if (action.id === "start_service") {
          await fetcher.post(`/api/provider/bookings/${bookingId}/start-service`, {});
          toast.success(t("web.provider.bookings.statusActions.serviceStarted"));
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

        toast.success(t("web.provider.bookings.statusActions.statusUpdated"));
        onUpdated?.();
      } catch (err) {
        const fetchErr = err instanceof FetchError ? err : null;
        const msg = mapProviderBookingActionError(
          err instanceof Error ? err.message : t("web.provider.bookings.statusActions.statusUpdateFailed"),
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

  const visibleActions = model.actions.filter((action) => {
    if (!actionAllowed(action)) return false;
    if (action.id === "mark_no_show") {
      const delayMinutes = Number(raw.customer_running_late_minutes ?? 0);
      if (
        shouldSuppressNoShowAfterRunningLate({
          scheduledAt: String(raw.scheduled_at ?? appointment.scheduled_date ?? ""),
          delayMinutes,
          customerRunningLateAt: (raw.customer_running_late_at as string | null) ?? null,
        })
      ) {
        return false;
      }
    }
    return true;
  });
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
      toast.success(t("web.provider.bookings.statusActions.etaUpdated"));
      onUpdated?.();
    } catch (err) {
      const fetchErr = err instanceof FetchError ? err : null;
      const msg = mapProviderBookingActionError(
        err instanceof Error ? err.message : t("web.provider.bookings.statusActions.etaUpdateFailed"),
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
        message={t("web.provider.bookings.statusActions.noStatusPermission")}
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

        {appointment.customer_running_late_at || raw.customer_running_late_at ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-2">
            <p className="font-semibold">
              {appointment.customer_running_late_minutes || raw.customer_running_late_minutes
                ? t("web.provider.bookings.statusActions.customerRunningLateMinutes", {
                    minutes: appointment.customer_running_late_minutes ?? raw.customer_running_late_minutes,
                  })
                : t("web.provider.bookings.statusActions.customerRunningLate")}
            </p>
            {appointment.provider_late_ack_at || raw.provider_late_ack_at ? (
              <p>{t("web.provider.bookings.statusActions.willWaitAcknowledged")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  disabled={ackBusy || busy != null}
                  onClick={async () => {
                    setAckBusy(true);
                    try {
                      await fetcher.post(
                        `/api/provider/bookings/${appointment.id}/acknowledge-late`,
                        {},
                      );
                      toast.success(t("web.provider.bookings.statusActions.notifyWillWait"));
                      onUpdated?.();
                    } catch (err) {
                      toast.error(err instanceof FetchError ? err.message : t("web.provider.bookings.statusActions.acknowledgeFailed"));
                    } finally {
                      setAckBusy(false);
                    }
                  }}
                >
                  {ackBusy
                    ? t("web.provider.bookings.statusActions.sending")
                    : t("web.provider.bookings.statusActions.okWeWillWait")}
                </BookingActionButton>
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  disabled={busy != null}
                  onClick={() => router.push(`/provider/bookings/${appointment.id}`)}
                >
                  {t("web.provider.bookings.statusActions.reschedule")}
                </BookingActionButton>
              </div>
            )}
          </div>
        ) : null}

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
                {t("web.provider.bookings.statusActions.pastEtaWarning")}
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
              {isUpdatingEta
                ? t("web.provider.bookings.statusActions.updatingEta")
                : t("web.provider.bookings.statusActions.updateEta")}
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
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t("web.provider.bookings.statusActions.updating")}
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
            {t("web.provider.bookings.statusActions.openFullPage")}
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
