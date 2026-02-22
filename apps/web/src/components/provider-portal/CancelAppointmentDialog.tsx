"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle } from "lucide-react";
import type { Appointment, CancellationPolicy } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import { Money } from "./Money";

interface CancelAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  cancellationPolicy: CancellationPolicy | null;
  onSuccess?: () => void;
}

export function CancelAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  cancellationPolicy,
  onSuccess,
}: CancelAppointmentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [cancellationFee, setCancellationFee] = useState(0);
  const [refundAmount, setRefundAmount] = useState(0);

  useEffect(() => {
    if (open && appointment && cancellationPolicy) {
      calculateFees();
    }
  }, [open, appointment, cancellationPolicy]);

  const calculateFees = () => {
    if (!appointment || !cancellationPolicy) return;

    const appointmentDate = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}`);
    const now = new Date();
    const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    let fee = 0;
    let refund = 0;

    if (hoursUntilAppointment < cancellationPolicy.cancellation_window_hours) {
      // Within cancellation window - apply fee
      const refundPercentage = cancellationPolicy.refund_percentage;
      refund = (appointment.price * refundPercentage) / 100;
      fee = appointment.price - refund;
    } else {
      // Outside cancellation window - full refund
      refund = appointment.price;
      fee = 0;
    }

    setCancellationFee(fee);
    setRefundAmount(refund);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await providerApi.updateAppointment(appointment.id, {
        status: "cancelled",
        cancellation_reason: reason || undefined,
        cancellation_fee: cancellationFee,
        cancellation_policy_id: cancellationPolicy?.id,
      });
      toast.success("Appointment cancelled");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to cancel appointment:", error);
      toast.error("Failed to cancel appointment");
    } finally {
      setIsLoading(false);
    }
  };

  const appointmentDate = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}`);
  const now = new Date();
  const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isWithinWindow = cancellationPolicy
    ? hoursUntilAppointment < cancellationPolicy.cancellation_window_hours
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg font-semibold">Cancel Appointment</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Are you sure you want to cancel this appointment? Cancellation policy will be applied.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {cancellationPolicy && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    {cancellationPolicy.name}
                  </p>
                  <p className="text-xs text-blue-700">
                    {isWithinWindow ? (
                      <>
                        Cancelling within {cancellationPolicy.cancellation_window_hours} hours of appointment.
                        Refund: {cancellationPolicy.refund_percentage}% ({refundAmount > 0 ? <Money amount={refundAmount} /> : "R0.00"})
                      </>
                    ) : (
                      <>
                        Cancelling more than {cancellationPolicy.cancellation_window_hours} hours before appointment.
                        Full refund available.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {cancellationFee > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800">
                Cancellation Fee: <Money amount={cancellationFee} />
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                This amount will not be refunded.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="reason">Cancellation Reason (Optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason for cancellation..."
            />
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto min-h-[44px] touch-manipulation"
            >
              Keep Appointment
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white min-h-[44px] touch-manipulation"
            >
              {isLoading ? "Cancelling..." : "Cancel Appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}