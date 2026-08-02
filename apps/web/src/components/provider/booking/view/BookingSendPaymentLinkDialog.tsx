"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingActionButton } from "../ui";

type SendLinkDelivery = "email" | "sms" | "both";

interface BookingSendPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  onSuccess?: () => void;
}

export function BookingSendPaymentLinkDialog({
  open,
  onOpenChange,
  bookingId,
  customerEmail,
  customerPhone,
  onSuccess,
}: BookingSendPaymentLinkDialogProps) {
  const [method, setMethod] = useState<SendLinkDelivery>("email");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (customerEmail) setMethod("email");
    else if (customerPhone) setMethod("sms");
  }, [open, customerEmail, customerPhone]);

  const handleSend = async () => {
    if ((method === "email" || method === "both") && !customerEmail) {
      toast.error("Customer email is required for email delivery");
      return;
    }
    if ((method === "sms" || method === "both") && !customerPhone) {
      toast.error("Customer phone number is required for SMS delivery");
      return;
    }
    setSending(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/send-payment-link`, {
        delivery_method: method,
      });
      toast.success(
        method === "both"
          ? "Payment link sent via email and SMS"
          : `Payment link sent via ${method === "email" ? "email" : "SMS"}`,
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to send payment link");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send payment link</DialogTitle>
          <DialogDescription>
            Send the customer a link to pay the outstanding balance online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Delivery method</label>
          <Select value={method} onValueChange={(v) => setMethod(v as SendLinkDelivery)}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {customerEmail ? <SelectItem value="email">Email</SelectItem> : null}
              {customerPhone ? <SelectItem value="sms">SMS</SelectItem> : null}
              {customerEmail && customerPhone ? (
                <SelectItem value="both">Email and SMS</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <BookingActionButton disabled={sending} onClick={() => void handleSend()}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Link2 className="mr-2 h-4 w-4" />
                Send link
              </>
            )}
          </BookingActionButton>
          <BookingActionButton variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
            Cancel
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
