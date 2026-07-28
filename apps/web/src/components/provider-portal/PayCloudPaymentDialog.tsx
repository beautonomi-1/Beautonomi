"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import React, { useState, useEffect } from "react";
import { humanizePaycloudPaymentError } from "@beautonomi/utils";
import { paycloudApi, type PaycloudPayment, type PaycloudTerminal } from "@/lib/provider-portal/paycloud-api";
import { FetchError } from "@/lib/http/fetcher";
import { selectTerminalForLocation } from "@/lib/payments/select-terminal-for-location";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Loader2, CheckCircle2, XCircle, QrCode, AlertTriangle } from "lucide-react";
import { isPaycloudCaptureUnderReview } from "@/lib/payments/paycloud-capture-review";
import { toast } from "sonner";
import { Money } from "./Money";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import Link from "next/link";

export interface PayCloudPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  entityType: "booking" | "group_booking" | "sale" | "product_order" | "additional_charge";
  entityId: string;
  bookingId?: string;
  saleId?: string;
  groupBookingId?: string;
  bookingLocationId?: string | null;
  /**
   * Set when `amount` already includes a tip captured upstream (e.g. the checkout
   * tip selector). Hides this dialog's tip input so staff cannot tip twice.
   */
  tipIncludedInAmount?: boolean;
  onSuccess?: (payment: PaycloudPayment) => void;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

function paycloudToastMessage(error: unknown, fallback: string): string {
  const code = error instanceof FetchError ? error.code : undefined;
  const raw = error instanceof Error ? error.message : fallback;
  return humanizePaycloudPaymentError(code, raw).message;
}

export function PayCloudPaymentDialog({
  open,
  onOpenChange,
  amount,
  entityType,
  entityId,
  bookingId,
  saleId,
  groupBookingId,
  bookingLocationId,
  tipIncludedInAmount = false,
  onSuccess,
}: PayCloudPaymentDialogProps) {
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const paycloudEnabled = bundle?.flags?.payment_paycloud?.enabled === true;
  const qrFlagEnabled = bundle?.flags?.payment_paycloud_qr?.enabled === true;
  const cashbackFlagEnabled = bundle?.flags?.payment_paycloud_cashback?.enabled === true;
  const { ready: paycloudReady, loading: readinessLoading, blockers } = usePaycloudCollectReady();

  const [terminals, setTerminals] = useState<PaycloudTerminal[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [customAmount, setCustomAmount] = useState(amount.toString());
  const [tipAmount, setTipAmount] = useState("");
  const [cashbackAmount, setCashbackAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"card" | "qr">("card");
  const [qrEnabled, setQrEnabled] = useState(false);
  const [cashbackEnabled, setCashbackEnabled] = useState(false);
  const [locationWarning, setLocationWarning] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaycloudPayment | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (open && paycloudEnabled) {
      setSelectedTerminalId("");
      setCustomAmount(amount.toString());
      setTipAmount("");
      setCashbackAmount("");
      setPayMethod("card");
      setPaymentResult(null);
      setActivePaymentId(null);
      void loadTerminals();
    }
  }, [open, amount, paycloudEnabled]);

  const loadTerminals = async () => {
    try {
      const data = await paycloudApi.listTerminals();
      const active = data.terminals.filter((t) => t.is_active);
      setTerminals(active);
      setQrEnabled(qrFlagEnabled && data.qr_payments_enabled);
      setCashbackEnabled(cashbackFlagEnabled && data.cashback_enabled);

      const { terminal, warning } = selectTerminalForLocation(active, bookingLocationId);
      setLocationWarning(warning);
      if (terminal) setSelectedTerminalId(terminal.id);
    } catch (error) {
      console.error("Failed to load card machines:", error);
      toast.error("Failed to load card machines");
    }
  };

  const handleCancel = async () => {
    if (activePaymentId) {
      try {
        await paycloudApi.closePayment(activePaymentId);
      } catch {
        /* best effort */
      }
    }
    onOpenChange(false);
  };

  const handleProcessPayment = async () => {
    if (!selectedTerminalId) {
      toast.error("Please select a card machine");
      return;
    }
    const chargeAmount = parseFloat(customAmount);
    if (isNaN(chargeAmount) || chargeAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      setIsProcessing(true);
      setPaymentResult(null);

      const created = await paycloudApi.createPayment({
        terminal_id: selectedTerminalId,
        entity_type: entityType,
        entity_id: entityId,
        amount: chargeAmount,
        tip_amount: tipAmount ? parseFloat(tipAmount) : undefined,
        cashback_amount: cashbackAmount ? parseFloat(cashbackAmount) : undefined,
        pay_method: payMethod,
        currency: tenantCurrency,
        booking_id: bookingId,
        sale_id: saleId,
        group_booking_id: groupBookingId,
      });

      const paymentId = created.payment_id ?? created.id;
      setActivePaymentId(paymentId);

      let payment = created;
      if (payment.status === "pending" || payment.status === "processing") {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          try {
            const updated = await paycloudApi.getPayment(paymentId);
            payment = updated;
            if (updated.status === "successful" || updated.status === "failed" || updated.status === "cancelled") {
              break;
            }
          } catch {
            /* continue polling */
          }
        }
      }

      setPaymentResult(payment);
      setActivePaymentId(null);

      if (isPaycloudCaptureUnderReview(payment)) {
        // Real money on the machine that did NOT settle to this entity. Firing
        // onSuccess would mark the balance cleared and hide the discrepancy.
        toast.warning("Card machine took a different amount — flagged for review.");
      } else if (payment.status === "successful") {
        toast.success("Payment received on card machine");
        onSuccess?.(payment);
      } else if (payment.status === "pending" || payment.status === "processing") {
        toast.error("Payment timed out — check the card machine or try again.");
      } else {
        toast.error(
          humanizePaycloudPaymentError(undefined, payment.error_message || "Payment was not completed").message,
        );
      }
    } catch (error: unknown) {
      console.error("PayCloud payment failed:", error);
      toast.error(paycloudToastMessage(error, "Could not reach the card machine — check it is online."));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoidOnTerminal = async () => {
    if (!paymentResult?.id) return;
    try {
      setVoiding(true);
      const voidRow = await paycloudApi.voidPayment(paymentResult.id);
      if (voidRow.status === "processing" || voidRow.status === "successful") {
        toast.success("Void sent to card machine — follow prompts on the device.");
      } else {
        toast.error(
          humanizePaycloudPaymentError(undefined, voidRow.error_message || "Could not void on the card machine.").message,
        );
      }
    } catch (error: unknown) {
      toast.error(paycloudToastMessage(error, "Could not void on the card machine."));
    } finally {
      setVoiding(false);
    }
  };


  if (!paycloudEnabled) return null;

  const selectedTerminal = terminals.find((t) => t.id === selectedTerminalId);
  const captureNeedsReview = isPaycloudCaptureUnderReview(paymentResult);
  const isSandboxMachine = selectedTerminal?.merchant?.environment === "sandbox";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : handleCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Beautonomi card machine
          </DialogTitle>
          <DialogDescription>
            Send the amount to your card machine — the customer pays by card or wallet QR on the device.
          </DialogDescription>
        </DialogHeader>

        {paymentResult ? (
          <div className="space-y-4 py-4">
            {captureNeedsReview ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-900">
                  <div className="mb-1 font-semibold">Payment needs review</div>
                  <div className="text-sm">
                    <Money amount={paymentResult.amount} /> captured
                    {typeof paymentResult.expected_amount === "number" ? (
                      <>
                        {" · "}
                        <Money amount={paymentResult.expected_amount} /> was due
                      </>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs">
                    The card machine took a different amount than the balance due, so it
                    was not applied to this charge automatically. It has been flagged for
                    review — the balance still shows as owing until it is resolved.
                  </p>
                  <Link
                    href="/provider/settings/sales/card-machines"
                    className="mt-2 inline-block text-xs font-semibold underline underline-offset-2"
                  >
                    Review in card machine settings
                  </Link>
                </AlertDescription>
              </Alert>
            ) : paymentResult.status === "successful" ? (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <div className="font-semibold mb-1">Payment successful</div>
                  <div className="text-sm">
                    <Money amount={paymentResult.amount} /> received
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-red-50 border-red-200">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {paymentResult.error_message || "Payment was not completed on the card machine."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : readinessLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !paycloudReady ? (
          <div className="space-y-4 py-4">
            <Alert className="border-amber-200 bg-amber-50">
              <AlertDescription className="text-amber-900">
                <div className="font-semibold mb-1">Card machines not ready</div>
                <div className="text-sm">Complete setup before charging on a card machine.</div>
              </AlertDescription>
            </Alert>
            <ul className="space-y-2">
              {blockers.map((b) => (
                <li key={b.code} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{b.title}</span>
                  {b.href ? (
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <Link href={b.href}>{b.actionLabel}</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-500">{b.actionLabel}</span>
                  )}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/provider/settings/sales/card-machines">Open card machines settings</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {isSandboxMachine ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertDescription className="text-amber-900">
                  <div className="mb-1 inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    TEST
                  </div>
                  <p className="mt-2 text-xs">
                    This is a test card machine. Payments still mark the balance paid — void them when you are done testing.
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}
            <div>
              <Label htmlFor="terminal">Card machine</Label>
              {terminals.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500 rounded-md border px-3 py-2">
                  No active card machines — add one in Settings → Card machines.
                </p>
              ) : (
                <Select value={selectedTerminalId} onValueChange={setSelectedTerminalId}>
                  <SelectTrigger id="terminal" className="mt-1">
                    <SelectValue placeholder="Select a card machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {terminals.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.display_name}
                        {t.location_name ? ` (${t.location_name})` : " (Portable)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {locationWarning ? (
                <p className="mt-1 text-xs text-amber-700">
                  {locationWarning}{" "}
                  <Link
                    href="/provider/settings/sales/card-machines"
                    className="font-medium underline underline-offset-2"
                  >
                    Card machine settings
                  </Link>
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="mt-1"
              />
            </div>

            {tipIncludedInAmount ? (
              <p className="rounded-md border bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Any tip entered at checkout is already included in this amount.
              </p>
            ) : (
              <div>
                <Label htmlFor="tip">Tip (optional)</Label>
                <Input
                  id="tip"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="mt-1"
                  placeholder="0.00"
                />
              </div>
            )}

            {cashbackEnabled ? (
              <div>
                <Label htmlFor="cashback">Cashback (optional)</Label>
                <Input
                  id="cashback"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashbackAmount}
                  onChange={(e) => setCashbackAmount(e.target.value)}
                  className="mt-1"
                  placeholder="0.00"
                />
              </div>
            ) : null}

            {qrEnabled ? (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Wallet QR payment</span>
                </div>
                <Switch checked={payMethod === "qr"} onCheckedChange={(v) => setPayMethod(v ? "qr" : "card")} />
              </div>
            ) : null}

            {selectedTerminal?.last_error ? (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">Last error: {selectedTerminal.last_error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {!paymentResult ? (
            <>
              <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
                Cancel
              </Button>
              <Button onClick={handleProcessPayment} disabled={isProcessing || !selectedTerminalId || !paycloudReady}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Waiting on card machine…
                  </>
                ) : (
                  "Charge card machine"
                )}
              </Button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              {paymentResult.status === "successful" && paymentResult.merchant_order_no ? (
                <Button
                  variant="outline"
                  onClick={() => void handleVoidOnTerminal()}
                  disabled={voiding}
                >
                  {voiding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending void…
                    </>
                  ) : (
                    "Void on card machine"
                  )}
                </Button>
              ) : null}
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
