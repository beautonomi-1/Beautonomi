"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const prefix = "web.provider.portal.sendPaymentLinkDialog";
  const [method, setMethod] = useState<SendLinkDelivery>("email");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (customerEmail) setMethod("email");
    else if (customerPhone) setMethod("sms");
  }, [open, customerEmail, customerPhone]);

  const handleSend = async () => {
    if ((method === "email" || method === "both") && !customerEmail) {
      toast.error(t(`${prefix}.emailRequired`));
      return;
    }
    if ((method === "sms" || method === "both") && !customerPhone) {
      toast.error(t(`${prefix}.phoneRequired`));
      return;
    }
    setSending(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/send-payment-link`, {
        delivery_method: method,
      });
      toast.success(
        method === "both"
          ? t(`${prefix}.sentBoth`)
          : method === "email"
            ? t(`${prefix}.sentEmail`)
            : t(`${prefix}.sentSms`),
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t(`${prefix}.sendFailed`));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`${prefix}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`${prefix}.description`)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">{t(`${prefix}.deliveryMethod`)}</label>
          <Select value={method} onValueChange={(v) => setMethod(v as SendLinkDelivery)}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {customerEmail ? <SelectItem value="email">{t(`${prefix}.email`)}</SelectItem> : null}
              {customerPhone ? <SelectItem value="sms">{t(`${prefix}.sms`)}</SelectItem> : null}
              {customerEmail && customerPhone ? (
                <SelectItem value="both">{t(`${prefix}.emailAndSms`)}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <BookingActionButton disabled={sending} onClick={() => void handleSend()}>
            {sending ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t(`${prefix}.sending`)}
              </>
            ) : (
              <>
                <Link2 className="me-2 h-4 w-4" />
                {t(`${prefix}.sendLink`)}
              </>
            )}
          </BookingActionButton>
          <BookingActionButton variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </BookingActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
