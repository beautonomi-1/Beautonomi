"use client";

import { useState } from "react";
import { Loader2, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingBottomSheet, BookingActionButton, BookingSectionCard, BookingSectionLabel } from "../ui";

interface GroupPaystackTerminalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupBookingId: string;
  expectedAmount: number;
}

export function GroupPaystackTerminalSheet({
  open,
  onOpenChange,
  groupBookingId,
  expectedAmount,
}: GroupPaystackTerminalSheetProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const [preparing, setPreparing] = useState(false);
  const [terminalCode, setTerminalCode] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const prepare = async () => {
    if (expectedAmount <= 0) {
      toast.error("No outstanding balance to collect");
      return;
    }
    setPreparing(true);
    try {
      const response = await fetcher.post<{
        data?: {
          terminal?: {
            terminal_code?: string;
            payment_link?: string | null;
            qr_url?: string | null;
          };
        };
      }>("/api/provider/paystack/terminal-payments", {
        entity_type: "group_booking",
        entity_id: groupBookingId,
        expected_amount: expectedAmount,
      });
      const terminal = response?.data?.terminal;
      if (!terminal?.terminal_code) {
        toast.error("No Paystack Terminal is ready — set one up in Settings → Sales");
        return;
      }
      setTerminalCode(terminal.terminal_code);
      setPaymentLink(terminal.payment_link ?? null);
      setQrUrl(terminal.qr_url ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare Paystack Terminal");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTerminalCode(null);
          setPaymentLink(null);
          setQrUrl(null);
        }
        onOpenChange(next);
      }}
      mode="view"
      header={
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold flex-1">Paystack Terminal</h2>
          <button type="button" onClick={() => onOpenChange(false)} className="p-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-4">
        <BookingSectionCard>
          <BookingSectionLabel className="mb-2">Amount due</BookingSectionLabel>
          <p className="text-2xl font-bold">{formatMoney(expectedAmount)}</p>
        </BookingSectionCard>

        {!terminalCode ? (
          <BookingActionButton disabled={preparing} onClick={() => void prepare()}>
            {preparing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <QrCode className="mr-2 h-4 w-4" />
                Generate QR / link
              </>
            )}
          </BookingActionButton>
        ) : (
          <BookingSectionCard>
            <p className="text-sm text-gray-600 mb-2">Terminal code: {terminalCode}</p>
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="Paystack terminal QR" className="mx-auto max-w-[220px] rounded-lg border" />
            ) : null}
            {paymentLink ? (
              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block text-sm font-semibold text-green-700 underline"
              >
                Open payment link
              </a>
            ) : null}
          </BookingSectionCard>
        )}
      </div>
    </BookingBottomSheet>
  );
}
