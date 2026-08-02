"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Appointment } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { providerPortalFetch } from "@/lib/http/fetcher";
import { formatApiErrorMessage } from "@/lib/http/api-error";
import { AvailabilitySlotPicker } from "@/components/appointments/AvailabilitySlotPicker";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGateInline } from "../scenario/PermissionGateInline";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
} from "../ui";

interface RescheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  onSuccess?: () => void;
}

export function RescheduleSheet({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: RescheduleSheetProps) {
  const { hasPermission, isOwner } = usePermissions();
  const canEditAppointments = isOwner || hasPermission("edit_appointments");
  const [date, setDate] = useState(appointment.scheduled_date ?? "");
  const [time, setTime] = useState(appointment.scheduled_time ?? "");
  const [saving, setSaving] = useState(false);
  const [notifyClient, setNotifyClient] = useState(true);

  useEffect(() => {
    if (open) {
      setDate(appointment.scheduled_date ?? "");
      setTime((appointment.scheduled_time ?? "").slice(0, 5));
      setNotifyClient(true);
    }
  }, [open, appointment]);

  const staffId = appointment.team_member_id ?? "";
  const locationId = appointment.location_id ?? "";
  const duration = appointment.duration_minutes ?? 60;
  const isAtHome = appointment.location_type === "at_home";

  const handleSave = async () => {
    if (!date || !time) {
      toast.error("Select a date and time");
      return;
    }
    setSaving(true);
    try {
      await providerApi.rescheduleAppointment(appointment.id, date, time);

      if (notifyClient) {
        const oldDate = appointment.scheduled_date;
        const oldTime = appointment.scheduled_time;
        const timeChanged = oldDate !== date || (oldTime ?? "").slice(0, 5) !== time.slice(0, 5);
        if (timeChanged) {
          try {
            await providerPortalFetch(`/api/provider/bookings/${appointment.id}/notify-reschedule`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                old_date: oldDate,
                old_time: oldTime,
                new_date: date,
                new_time: time,
              }),
            });
          } catch {
            toast.warning("Rescheduled, but client notification failed");
          }
        }
      }

      toast.success("Booking rescheduled");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(formatApiErrorMessage(error, "Failed to reschedule"));
    } finally {
      setSaving(false);
    }
  };

  const footer = canEditAppointments ? (
    <BookingActionButton disabled={saving || !date || !time} onClick={handleSave}>
      {saving ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Saving…
        </>
      ) : (
        "Save new time"
      )}
    </BookingActionButton>
  ) : undefined;

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      title="Reschedule"
      footer={footer}
    >
      {!canEditAppointments ? (
        <PermissionGateInline
          allowed={false}
          message="You do not have permission to reschedule appointments."
        />
      ) : staffId && locationId ? (
        <>
          <AvailabilitySlotPicker
            staffId={staffId}
            locationId={locationId}
            duration={duration}
            selectedDate={date}
            selectedTime={time}
            onDateChange={setDate}
            onTimeChange={setTime}
            mode={isAtHome ? "mobile" : "salon"}
            excludeBookingId={appointment.id}
          />
          <BookingSectionCard className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <BookingSectionLabel className="mb-0">Notify client of change</BookingSectionLabel>
              <Switch checked={notifyClient} onCheckedChange={setNotifyClient} />
            </div>
          </BookingSectionCard>
        </>
      ) : (
        <p className="text-sm text-gray-500 py-4">
          Staff or location is missing — reschedule from the full booking editor.
        </p>
      )}
    </BookingBottomSheet>
  );
}
