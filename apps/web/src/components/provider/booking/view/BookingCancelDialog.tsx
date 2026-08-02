"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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

type CancelReason = "normal" | "late_cancel" | "no_show";

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
  const [reason, setReason] = useState<CancelReason>("normal");
  const [notifyClient, setNotifyClient] = useState(true);
  const [saving, setSaving] = useState(false);

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
          toast.error("Booking cancelled but notification could not be sent");
        }
      }

      toast.success("Booking cancelled");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to cancel booking"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel booking</DialogTitle>
          <DialogDescription>
            Select a cancellation reason. This is recorded for reporting and may affect fees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Reason</label>
            <Select value={reason} onValueChange={(v) => setReason(v as CancelReason)}>
              <SelectTrigger className="rounded-xl min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal cancellation</SelectItem>
                <SelectItem value="late_cancel">Late cancellation</SelectItem>
                <SelectItem value="no_show">No show</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Notify client</p>
              <p className="text-xs text-gray-500">Send cancellation notice</p>
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling…
              </>
            ) : (
              "Cancel booking"
            )}
          </BookingActionButton>
          <BookingActionButton variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Keep booking
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
