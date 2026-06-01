"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";

export type TerminalCollectEntityType =
  | "booking"
  | "product_order"
  | "sale"
  | "group_booking"
  | "invoice";

type CollectionIntentResponse = {
  data?: {
    terminal?: {
      terminal_code?: string;
      payment_link?: string | null;
      terminal_url?: string | null;
      qr_url?: string | null;
    };
    terminals?: Array<{ id: string; display_name?: string | null; name?: string | null; terminal_code: string }>;
    customerReference?: string | null;
    expectedAmount?: number | null;
  };
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: TerminalCollectEntityType;
  entityId: string;
  /** Human reference (e.g. booking number) used both as customer reference and display. */
  reference?: string | null;
  expectedAmount: number;
  currency: string;
  /** Optional explicit terminal id (multi-terminal picker upstream). */
  terminalId?: string | null;
}

function qrSrc(qrUrl: string | null, paymentLink: string | null): string | null {
  if (qrUrl) return qrUrl;
  if (paymentLink)
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(paymentLink)}`;
  return null;
}

export function PaystackTerminalCollectDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  reference,
  expectedAmount,
  currency,
  terminalId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [customerReference, setCustomerReference] = useState<string | null>(reference ?? null);
  const [terminals, setTerminals] = useState<
    Array<{ id: string; display_name?: string | null; name?: string | null; terminal_code: string }>
  >([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(terminalId ?? null);

  const prepare = useCallback(
    async (overrideTerminalId?: string | null) => {
      setLoading(true);
      try {
        const response = await fetcher.post<CollectionIntentResponse>(
          "/api/provider/paystack/terminal-payments",
          {
            entity_type: entityType,
            entity_id: entityId,
            expected_amount: expectedAmount,
            customer_reference: reference ?? undefined,
            terminal_id: overrideTerminalId ?? terminalId ?? undefined,
          },
        );
        const terminal = response.data?.terminal;
        if (!terminal?.terminal_code) {
          toast.error("No Paystack Terminal is ready.");
          onOpenChange(false);
          return;
        }
        setCode(terminal.terminal_code);
        setPaymentLink(terminal.payment_link ?? terminal.terminal_url ?? null);
        setQrUrl(terminal.qr_url ?? null);
        setCustomerReference(response.data?.customerReference ?? reference ?? null);
        setTerminals(response.data?.terminals ?? []);
        const resolvedId =
          response.data?.terminals?.find((t) => t.terminal_code === terminal.terminal_code)?.id ?? null;
        if (resolvedId) setSelectedTerminalId(resolvedId);
      } catch (err) {
        toast.error(err instanceof FetchError ? err.message : "Failed to prepare terminal payment.");
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId, expectedAmount, reference, terminalId, onOpenChange],
  );

  useEffect(() => {
    if (open) {
      setCode(null);
      void prepare();
    }
  }, [open, prepare]);

  const qr = qrSrc(qrUrl, paymentLink);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Collect with Paystack Terminal</DialogTitle>
        </DialogHeader>
        {loading || !code ? (
          <div className="py-10 text-center text-sm text-gray-500">Preparing…</div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Ask the customer to scan or open the link and pay. Once Paystack confirms, the
              payment appears in your terminal inbox to allocate.
            </p>
            {terminals.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Collect on terminal
                </p>
                <div className="flex flex-wrap gap-2">
                  {terminals.map((t) => {
                    const active = selectedTerminalId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTerminalId(t.id);
                          void prepare(t.id);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          active
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 bg-white text-gray-600"
                        }`}
                      >
                        {t.display_name || t.name || t.terminal_code}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Terminal code</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-emerald-950">{code}</p>
              <p className="mt-1 text-sm text-emerald-800">
                Expected: {currency} {expectedAmount.toFixed(2)}
              </p>
              {qr && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr}
                    alt="Paystack Terminal QR code"
                    className="h-44 w-44 rounded-md border border-emerald-200 bg-white object-contain p-1"
                  />
                  <p className="text-xs text-emerald-700">Customer scans to pay</p>
                </div>
              )}
            </div>
            {customerReference && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Tell the customer to enter reference
                </p>
                <p className="mt-1 font-mono text-base font-semibold text-amber-950">
                  {customerReference}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-amber-800 underline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(customerReference);
                    toast.success("Reference copied");
                  }}
                >
                  Copy reference
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {paymentLink && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    await navigator.clipboard.writeText(paymentLink);
                    toast.success("Payment link copied");
                  }}
                >
                  Copy link
                </Button>
              )}
              <Button type="button" className="flex-1" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
