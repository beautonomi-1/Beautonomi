"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { providerApi } from "@/lib/provider-portal/api";
import { providerPortalFetch } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import type { Appointment } from "@/lib/provider-portal/types";
import { BookingActionButton } from "../ui";
import { useTranslation } from "@beautonomi/i18n";

type CancelReason = "normal" | "late_cancel" | "no_show";

function isBookingScheduledInPast(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function resolveAppointmentScheduledAt(appointment: Appointment): string | null {
  if (appointment.scheduled_at) return appointment.scheduled_at;
  if (appointment.scheduled_date && appointment.scheduled_time) {
    return `${appointment.scheduled_date}T${appointment.scheduled_time}`;
  }
  return null;
}

interface BookingCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  version?: number;
  onSuccess?: () => void;
}

export function BookingCancelDialog({
  open,
  onOpenChange,
  appointment,
  version,
  onSuccess,
}: BookingCancelDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<CancelReason>("normal");
  const [notifyClient, setNotifyClient] = useState(true);
  const [saving, setSaving] = useState(false);
  const isPastBooking = useMemo(
    () => isBookingScheduledInPast(resolveAppointmentScheduledAt(appointment)),
    [appointment],
  );

  const handleCancel = async () => {
    setSaving(true);
    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "cancelled",
        cancellation_reason: reason,
        version,
      } as Partial<Appointment>);

      if (notifyClient) {
        try {
          await providerPortalFetch(`/api/provider/bookings/${appointment.id}/notify-cancellation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cancellation_type: reason }),
          });
        } catch {
          toast.error(t("web.provider.bookings.cancelDialog.cancelledNotifyFailed"));
        }
      }

      toast.success(t("web.provider.bookings.cancelDialog.cancelled"));
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, t("web.provider.bookings.cancelDialog.cancelFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.provider.bookings.cancelDialog.title")}</DialogTitle>
          <DialogDescription>{t("web.provider.bookings.cancelDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isPastBooking ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
                <p>{t("web.provider.bookings.cancelDialog.pastBookingWarning")}</p>
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">{t("web.provider.bookings.cancelDialog.reasonLabel")}</label>
            <Select value={reason} onValueChange={(v) => setReason(v as CancelReason)}>
              <SelectTrigger className="rounded-xl min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">{t("web.provider.bookings.cancelDialog.reasonNormal")}</SelectItem>
                <SelectItem value="late_cancel">{t("web.provider.bookings.cancelDialog.reasonLateCancel")}</SelectItem>
                <SelectItem value="no_show">{t("web.provider.bookings.cancelDialog.reasonNoShow")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{t("web.provider.bookings.cancelDialog.notifyClient")}</p>
              <p className="text-xs text-gray-500">{t("web.provider.bookings.cancelDialog.notifyClientHint")}</p>
            </div>
            <Switch checked={notifyClient} onCheckedChange={setNotifyClient} />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <BookingActionButton
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            disabled={saving}
            onClick={() => void handleCancel()}
          >
            {saving ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t("web.provider.bookings.cancelDialog.cancelling")}
              </>
            ) : (
              t("web.provider.bookings.cancelDialog.cancelBooking")
            )}
          </BookingActionButton>
          <BookingActionButton variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("web.provider.bookings.cancelDialog.keepBooking")}
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
