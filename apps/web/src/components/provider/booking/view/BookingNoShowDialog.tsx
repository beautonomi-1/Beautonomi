"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import { mapProviderBookingActionError } from "@beautonomi/provider-booking";
import type { Appointment } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingActionButton } from "../ui";
import { shouldSuppressNoShowAfterRunningLate } from "@/lib/bookings/lifecycle-running-late";

interface BookingNoShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  version?: number;
  onSuccess?: () => void;
}

export function BookingNoShowDialog({
  open,
  onOpenChange,
  appointment,
  version,
  onSuccess,
}: BookingNoShowDialogProps) {
  const { t } = useTranslation();
  const { format: formatMoney } = useProviderMoneyFormat();
  const [saving, setSaving] = useState(false);
  const [noShowFeeEnabled, setNoShowFeeEnabled] = useState(false);
  const [noShowFeeAmount, setNoShowFeeAmount] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetcher
      .get<{ data?: { noShowFeeEnabled?: boolean; noShowFeeAmount?: number } }>(
        "/api/provider/settings/payments",
      )
      .then((response) => {
        if (cancelled) return;
        setNoShowFeeEnabled(Boolean(response.data?.noShowFeeEnabled));
        setNoShowFeeAmount(Number(response.data?.noShowFeeAmount ?? 0));
      })
      .catch(() => {
        if (!cancelled) {
          setNoShowFeeEnabled(false);
          setNoShowFeeAmount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const raw = appointment as unknown as Record<string, unknown>;
  const runningLateAt =
    (appointment.customer_running_late_at as string | null | undefined) ??
    (raw.customer_running_late_at as string | null | undefined) ??
    null;
  const runningLateMinutes = Number(
    appointment.customer_running_late_minutes ?? raw.customer_running_late_minutes ?? 0,
  );
  const scheduledAt = String(
    appointment.scheduled_at ??
      raw.scheduled_at ??
      `${appointment.scheduled_date}T${appointment.scheduled_time || "00:00"}`,
  );
  const suppressNoShow = shouldSuppressNoShowAfterRunningLate({
    scheduledAt,
    delayMinutes: runningLateMinutes,
    customerRunningLateAt: runningLateAt,
  });
  const previewFee = useMemo(() => {
    if (!noShowFeeEnabled) return 0;
    const collected = Math.max(
      0,
      Math.max(Number(raw.total_paid ?? 0), 0) - Number(raw.total_refunded ?? 0),
    );
    return Math.min(noShowFeeAmount, Number(appointment.total_amount ?? 0), collected);
  }, [appointment.total_amount, noShowFeeAmount, noShowFeeEnabled, raw.total_paid, raw.total_refunded]);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const response = await fetcher.patch<{ booking: unknown; conflict?: boolean }>(
        `/api/provider/bookings/${appointment.id}`,
        { status: "no_show", version },
      );
      if (response.conflict) {
        const msg = mapProviderBookingActionError(null, "CONFLICT");
        toast.error(msg);
        return;
      }
      toast.success(t("web.provider.bookings.detail.toast.markedNoShow"));
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const fetchErr = err instanceof FetchError ? err : null;
      toast.error(
        formatApiErrorMessage(
          err,
          mapProviderBookingActionError(
            err instanceof Error ? err.message : t("web.provider.bookings.detail.toast.noShowFailed"),
            fetchErr?.code,
          ),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-amber-800">{t("web.provider.bookings.detail.leftoverCopy.markAsNoShow")}</DialogTitle>
          <DialogDescription>
            {t("web.provider.bookings.detail.leftoverCopy.markClientNoShow", { name: appointment.client_name ?? t("web.provider.bookings.detail.leftoverCopy.thisClient") })}
          </DialogDescription>
        </DialogHeader>

        {runningLateAt ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl p-3">
            {t("web.provider.bookings.detail.leftoverCopy.customerRunningLate")}
            {runningLateMinutes > 0 ? t("web.provider.bookings.detail.leftoverCopy.lateMinutes", { minutes: runningLateMinutes }) : ""}{t("web.provider.bookings.detail.leftoverCopy.reportedAt", { time: new Date(runningLateAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
            {suppressNoShow ? t("web.provider.bookings.detail.leftoverCopy.waitLateWindow") : ""}
          </p>
        ) : null}

        {noShowFeeEnabled && previewFee > 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
            {t("web.provider.bookings.detail.leftoverCopy.noShowFeeRetain", { amount: formatMoney(previewFee) })}
          </p>
        ) : (
          <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3">
            {noShowFeeEnabled
              ? t("web.provider.bookings.detail.leftoverCopy.noCollectedPayment")
              : t("web.provider.bookings.detail.leftoverCopy.noNoShowFeeConfigured")}
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <BookingActionButton disabled={saving || suppressNoShow} onClick={() => void handleConfirm()}>
            {saving ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t("web.provider.bookings.detail.leftoverCopy.saving")}
              </>
            ) : (
              t("web.provider.bookings.detail.dialogs.confirmNoShow")
            )}
          </BookingActionButton>
          <BookingActionButton variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("common.back")}
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
