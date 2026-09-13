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
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
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
          toast.error(t("web.provider.bookings.paystackTerminalCollect.noTerminal"));
          onOpenChange(false);
          return;
        }
        setCode(terminal.terminal_code);
        setPaymentLink(terminal.payment_link ?? terminal.terminal_url ?? null);
        setQrUrl(terminal.qr_url ?? null);
        setTerminals(response.data?.terminals ?? []);
        const resolvedId =
          response.data?.terminals?.find((t) => t.terminal_code === terminal.terminal_code)?.id ?? null;
        if (resolvedId) setSelectedTerminalId(resolvedId);
      } catch (err) {
        toast.error(err instanceof FetchError ? err.message : t("web.provider.bookings.paystackTerminalCollect.prepareFailed"));
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId, expectedAmount, reference, terminalId, onOpenChange, t],
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
          <DialogTitle>{t("web.provider.bookings.paystackTerminalCollect.title")}</DialogTitle>
        </DialogHeader>
        {loading || !code ? (
          <div className="py-10 text-center text-sm text-gray-500">{t("web.provider.bookings.paystackTerminalCollect.preparing")}</div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {t("web.provider.bookings.paystackTerminalCollect.instructions")}
            </p>
            {terminals.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("web.provider.bookings.paystackTerminalCollect.collectOnTerminal")}
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
              <p className="text-xs uppercase tracking-wide text-emerald-700">{t("web.provider.bookings.paystackTerminalCollect.terminalCode")}</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-emerald-950">{code}</p>
              <p className="mt-1 text-sm text-emerald-800">
                {t("web.provider.bookings.paystackTerminalCollect.expected", { currency, amount: expectedAmount.toFixed(2) })}
              </p>
              {qr && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr}
                    alt={t("web.provider.bookings.paystackTerminalCollect.qrAlt")}
                    className="h-44 w-44 rounded-md border border-emerald-200 bg-white object-contain p-1"
                  />
                  <p className="text-xs text-emerald-700">{t("web.provider.bookings.paystackTerminalCollect.customerScans")}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {paymentLink && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    await navigator.clipboard.writeText(paymentLink);
                    toast.success(t("web.provider.bookings.paystackTerminalCollect.linkCopied"));
                  }}
                >
                  {t("web.provider.bookings.paystackTerminalCollect.copyLink")}
                </Button>
              )}
              <Button type="button" className="flex-1" onClick={() => onOpenChange(false)}>
                {t("common.done")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
