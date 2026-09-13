"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import type { Appointment } from "@/lib/provider-portal/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingActionButton } from "../ui";
import { useTranslation } from "@beautonomi/i18n";

interface PaystackTerminalCollectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  onSuccess?: () => void;
}

export function PaystackTerminalCollectDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: PaystackTerminalCollectDialogProps) {
  const { t } = useTranslation();
  const { format: formatMoney } = useProviderMoneyFormat();
  const [preparing, setPreparing] = useState(false);
  const [terminalCode, setTerminalCode] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [expectedAmount, setExpectedAmount] = useState(0);

  const raw = appointment as unknown as Record<string, unknown>;
  const outstanding = computeBookingOutstandingDisplay({
    totalAmount: Number(appointment.total_amount ?? appointment.price ?? 0),
    totalPaid: Number(raw.total_paid ?? 0),
    totalRefunded: Number(raw.total_refunded ?? 0),
    walletAmount: Number(raw.wallet_amount ?? 0),
    giftCardAmount: Number(raw.gift_card_amount ?? 0),
    unpaidAdditionalCharges: Number(raw.unpaid_additional_charges ?? 0),
    paymentStatus: appointment.payment_status,
  });

  const prepareTerminal = useCallback(async () => {
    const amount = Number(outstanding.toFixed(2));
    if (amount <= 0) {
      toast.error(t("web.provider.bookings.detail.paystackCollect.noBalance"));
      return;
    }
    setPreparing(true);
    try {
      const response = await fetcher.post<{
        data?: {
          terminal?: {
            terminal_code?: string;
            payment_link?: string | null;
            terminal_url?: string | null;
            qr_url?: string | null;
          };
          customerReference?: string | null;
        };
      }>("/api/provider/paystack/terminal-payments", {
        entity_type: "booking",
        entity_id: appointment.id,
        expected_amount: amount,
        customer_reference: raw.booking_number ?? appointment.id,
      });
      const code = response.data?.terminal?.terminal_code;
      if (!code) {
        toast.error(t("web.provider.bookings.detail.paystackCollect.noTerminal"));
        return;
      }
      setTerminalCode(code);
      setReference(response.data?.customerReference ?? String(raw.booking_number ?? appointment.id));
      setPaymentLink(
        response.data?.terminal?.payment_link ?? response.data?.terminal?.terminal_url ?? null,
      );
      setQrUrl(response.data?.terminal?.qr_url ?? null);
      setExpectedAmount(amount);
    } catch (err) {
      toast.error(
        err instanceof FetchError ? err.message : t("web.provider.bookings.detail.paystackCollect.prepareFailed"),
      );
    } finally {
      setPreparing(false);
    }
  }, [appointment.id, outstanding, raw.booking_number, t]);

  useEffect(() => {
    if (open && !terminalCode && !preparing) {
      void prepareTerminal();
    }
  }, [open, terminalCode, preparing, prepareTerminal]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTerminalCode(null);
      setReference(null);
      setPaymentLink(null);
      setQrUrl(null);
      setExpectedAmount(0);
    }
    onOpenChange(next);
  };

  const handleOpen = (next: boolean) => {
    handleOpenChange(next);
    if (next && !terminalCode) {
      void prepareTerminal();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("web.provider.bookings.detail.paystackCollect.title")}</DialogTitle>
          <DialogDescription>
            {t("web.provider.bookings.detail.paystackCollect.description")}
          </DialogDescription>
        </DialogHeader>

        {preparing && !terminalCode ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            {t("web.provider.bookings.detail.paystackCollect.preparing")}
          </p>
        ) : terminalCode ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-emerald-700">
                {t("web.provider.bookings.detail.paystackCollect.terminalCode")}
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-emerald-950">{terminalCode}</p>
              <p className="mt-2 text-sm text-emerald-800">
                {t("web.provider.bookings.detail.paystackCollect.expected", { amount: formatMoney(expectedAmount) })}
              </p>
              {(qrUrl || paymentLink) && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      qrUrl ??
                      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentLink ?? "")}`
                    }
                    alt={t("web.provider.bookings.detail.paystackCollect.qrAlt")}
                    className="h-40 w-40 rounded-md border border-emerald-200 bg-white object-contain p-1"
                  />
                  <p className="text-xs text-emerald-700">
                    {t("web.provider.bookings.detail.paystackCollect.customerScans")}
                  </p>
                </div>
              )}
            </div>

            {reference ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  {t("web.provider.bookings.detail.paystackCollect.customerReference")}
                </p>
                <p className="mt-1 font-mono text-base font-semibold text-amber-950">{reference}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-amber-800 underline touch-manipulation min-h-[44px]"
                  onClick={async () => {
                    await navigator.clipboard.writeText(reference);
                    toast.success(t("web.provider.bookings.detail.dialogs.referenceCopied"));
                  }}
                >
                  {t("web.provider.bookings.detail.dialogs.copyReference")}
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <BookingActionButton
                onClick={async () => {
                  await navigator.clipboard.writeText(terminalCode);
                  toast.success(t("web.provider.bookings.detail.dialogs.codeCopied"));
                }}
              >
                {t("web.provider.bookings.detail.dialogs.copyCode")}
              </BookingActionButton>
              {paymentLink ? (
                <BookingActionButton
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(paymentLink);
                    toast.success(t("web.provider.bookings.detail.dialogs.linkCopied"));
                  }}
                >
                  {t("web.provider.bookings.detail.paystackCollect.copyPaymentLink")}
                </BookingActionButton>
              ) : null}
              <BookingActionButton variant="outline" onClick={() => onSuccess?.()}>
                {t("common.done")}
              </BookingActionButton>
            </div>
          </div>
        ) : (
          <BookingActionButton
            variant="outline"
            onClick={() => void prepareTerminal()}
            disabled={preparing}
          >
            <Link2 className="me-2 h-4 w-4" />
            {t("common.retry")}
          </BookingActionButton>
        )}
      </DialogContent>
    </Dialog>
  );
}
