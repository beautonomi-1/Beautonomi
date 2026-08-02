"use client";

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
      toast.success("Booking marked as no-show");
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const fetchErr = err instanceof FetchError ? err : null;
      toast.error(
        formatApiErrorMessage(
          err,
          mapProviderBookingActionError(
            err instanceof Error ? err.message : "Failed to mark no-show",
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
          <DialogTitle className="text-amber-800">Mark as no-show</DialogTitle>
          <DialogDescription>
            Mark {appointment.client_name ?? "this client"} as a no-show?
          </DialogDescription>
        </DialogHeader>

        {noShowFeeEnabled && previewFee > 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
            A no-show fee of {formatMoney(previewFee)} will be retained (capped to the amount paid).
            Any remainder is refunded to the client&apos;s wallet.
          </p>
        ) : (
          <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3">
            {noShowFeeEnabled
              ? "No collected payment to retain as a no-show fee."
              : "No no-show fee is configured — paid amounts may be fully refunded per your policy."}
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <BookingActionButton disabled={saving} onClick={() => void handleConfirm()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Confirm no-show"
            )}
          </BookingActionButton>
          <BookingActionButton variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Back
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
