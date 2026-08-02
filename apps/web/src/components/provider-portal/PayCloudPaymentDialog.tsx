"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { humanizePaycloudPaymentError } from "@beautonomi/utils";
import { paycloudApi, type PaycloudPayment, type PaycloudTerminal } from "@/lib/provider-portal/paycloud-api";
import { FetchError } from "@/lib/http/fetcher";
import { selectTerminalForLocation } from "@/lib/payments/select-terminal-for-location";
import {
  pollPaycloudPaymentUntilSettled,
  PAYCLOUD_POLL_INTERVAL_MS,
  isPaycloudPaymentTerminal,
} from "@/lib/payments/paycloud-poll-payment";
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
import {
  canUsePaycloudSameTerminalOnWeb,
  getPaycloudSameTerminalBridge,
} from "@/lib/payments/paycloud-same-terminal-bridge";
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
  /** Resume an in-flight payment instead of creating a new charge. */
  resumePaymentId?: string | null;
  /** When true, amount already includes checkout tip — hide terminal tip field. */
  tipIncludedInAmount?: boolean;
  /** When false (default), charge amount is fixed to `amount` — entity collect flows. */
  amountEditable?: boolean;
  onSuccess?: (payment: PaycloudPayment) => void;
}

function paycloudToastMessage(error: unknown, fallback: string): string {
  const code = error instanceof FetchError ? error.code : undefined;
  const raw = error instanceof Error ? error.message : fallback;
  return humanizePaycloudPaymentError(code, raw).message;
}

function paymentRowId(payment: PaycloudPayment): string {
  return payment.payment_id ?? payment.id;
}

function extractPaycloudInFlightPaymentId(
  error: unknown,
  terminals: PaycloudTerminal[],
  selectedTerminalId: string,
): string | null {
  if (error instanceof FetchError) {
    const details = error.details as { payment_id?: string } | null | undefined;
    if (typeof details?.payment_id === "string" && details.payment_id.trim()) {
      return details.payment_id.trim();
    }
    if (error.code === "TERMINAL_IN_FLIGHT" || error.code === "ENTITY_IN_FLIGHT") {
      return terminals.find((t) => t.id === selectedTerminalId)?.in_flight_payment_id ?? null;
    }
  }
  return null;
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
  resumePaymentId,
  tipIncludedInAmount = false,
  amountEditable = false,
  onSuccess,
}: PayCloudPaymentDialogProps) {
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const paycloudEnabled = bundle?.flags?.payment_paycloud?.enabled === true;
  const qrFlagEnabled = bundle?.flags?.payment_paycloud_qr?.enabled === true;
  const cashbackFlagEnabled = bundle?.flags?.payment_paycloud_cashback?.enabled === true;
  const sameTerminalFlagEnabled = bundle?.flags?.payment_paycloud_same_terminal?.enabled === true;
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
  const [isPolling, setIsPolling] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaycloudPayment | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [sameTerminalAvailable, setSameTerminalAvailable] = useState(false);
  const [payOnThisDevice, setPayOnThisDevice] = useState(false);
  const pollAbortRef = useRef<AbortController | null>(null);

  const applySettledPayment = useCallback(
    (payment: PaycloudPayment) => {
      setPaymentResult(payment);
      setActivePaymentId(null);
      setIsPolling(false);

      if (isPaycloudCaptureUnderReview(payment)) {
        toast.warning("Card machine took a different amount — flagged for review.");
        return;
      }
      if (payment.status === "successful") {
        toast.success("Payment received on card machine");
        onSuccess?.(payment);
      } else if (payment.status === "pending" || payment.status === "processing") {
        toast.error("Payment timed out — check the card machine or tap Resume.");
      } else {
        toast.error(
          humanizePaycloudPaymentError(undefined, payment.error_message || "Payment was not completed").message,
        );
      }
    },
    [onSuccess],
  );

  const startPolling = useCallback(
    (paymentId: string) => {
      pollAbortRef.current?.abort();
      const controller = new AbortController();
      pollAbortRef.current = controller;
      setActivePaymentId(paymentId);
      setIsPolling(true);

      void (async () => {
        try {
          const settled = await pollPaycloudPaymentUntilSettled(paymentId, {
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            applySettledPayment(settled);
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          const code = err instanceof Error && err.message === "POLL_TIMEOUT" ? "POLL_TIMEOUT" : undefined;
          if (code === "POLL_TIMEOUT") {
            toast.error("Still waiting on the card machine — tap Resume when the customer has paid.");
          }
          setIsPolling(false);
        }
      })();
    },
    [applySettledPayment],
  );

  const loadTerminals = useCallback(async () => {
    try {
      const data = await paycloudApi.listTerminals();
      const active = data.terminals.filter((t) => t.is_active);
      setTerminals(active);
      setQrEnabled(qrFlagEnabled && data.qr_payments_enabled);
      setCashbackEnabled(cashbackFlagEnabled && data.cashback_enabled);

      const { terminal, warning } = selectTerminalForLocation(active, bookingLocationId);
      setLocationWarning(warning);
      if (terminal) {
        setSelectedTerminalId(terminal.id);
        if (terminal.in_flight_payment_id && !resumePaymentId) {
          setActivePaymentId(terminal.in_flight_payment_id);
        }
      }
    } catch (error) {
      console.error("Failed to load card machines:", error);
      toast.error("Failed to load card machines");
    }
  }, [bookingLocationId, cashbackFlagEnabled, qrFlagEnabled, resumePaymentId]);

  useEffect(() => {
    if (!open || !paycloudEnabled) return;
    setSelectedTerminalId("");
    setCustomAmount(amount.toString());
    setTipAmount("");
    setCashbackAmount("");
    setPayMethod("card");
    setPaymentResult(null);
    setActivePaymentId(resumePaymentId ?? null);
    setPayOnThisDevice(false);
    void loadTerminals();
    void canUsePaycloudSameTerminalOnWeb().then((ok) =>
      setSameTerminalAvailable(ok && sameTerminalFlagEnabled),
    );
  }, [open, amount, paycloudEnabled, resumePaymentId, loadTerminals, sameTerminalFlagEnabled]);

  /** Browser equivalent of mobile AppState recovery after returning from WiseCashier / another tab. */
  useEffect(() => {
    if (!open) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const paymentId =
        activePaymentId ??
        terminals.find((t) => t.id === selectedTerminalId)?.in_flight_payment_id ??
        null;
      if (!paymentId || paymentResult || isPolling) return;
      void (async () => {
        try {
          await paycloudApi.confirmPayment(paymentId);
        } catch {
          /* confirm is best-effort; polling is source of truth */
        }
        startPolling(paymentId);
      })();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [
    open,
    activePaymentId,
    selectedTerminalId,
    terminals,
    paymentResult,
    isPolling,
    startPolling,
  ]);

  useEffect(() => {
    if (!open || !resumePaymentId || paymentResult) return;
    startPolling(resumePaymentId);
  }, [open, resumePaymentId, paymentResult, startPolling]);

  useEffect(() => {
    if (payMethod !== "card" && payOnThisDevice) {
      setPayOnThisDevice(false);
    }
  }, [payMethod, payOnThisDevice]);

  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort();
    };
  }, []);

  const resolveInFlightPaymentId = useCallback(
    (overridePaymentId?: string | null) =>
      overridePaymentId ??
      activePaymentId ??
      terminals.find((t) => t.id === selectedTerminalId)?.in_flight_payment_id ??
      null,
    [activePaymentId, selectedTerminalId, terminals],
  );

  const offerCloudFallback = useCallback((message: string) => {
    const tryCloud = window.confirm(
      `${message}\n\nSend this charge to the card machine instead (cloud mode)?`,
    );
    if (tryCloud) {
      setPayOnThisDevice(false);
      return true;
    }
    return false;
  }, []);

  const handleResumeInFlight = async (overridePaymentId?: string | null) => {
    const paymentId = resolveInFlightPaymentId(overridePaymentId);
    if (!paymentId) {
      toast.error("No in-flight payment to resume");
      return;
    }
    setIsProcessing(true);
    try {
      await paycloudApi.confirmPayment(paymentId);
    } catch {
      /* confirm is best-effort for cloud; polling is source of truth */
    } finally {
      setIsProcessing(false);
    }
    startPolling(paymentId);
  };

  const handleCancelCharge = async () => {
    const paymentId = resolveInFlightPaymentId();
    if (!paymentId) return;
    try {
      await paycloudApi.closePayment(paymentId);
      toast.success("Charge cancelled on card machine");
    } catch {
      toast.error("Could not cancel charge — check card machine settings");
    }
    setActivePaymentId(null);
    setIsPolling(false);
    pollAbortRef.current?.abort();
  };

  const pushCloudCharge = async (chargeAmount: number): Promise<boolean> => {
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
      channel: "cloud",
    });

    const paymentId = paymentRowId(created);
    if (created.reused) {
      toast.info("Resuming payment already in progress on this card machine");
    }

    if (isPaycloudPaymentTerminal(created.status)) {
      applySettledPayment(created);
      return true;
    }

    startPolling(paymentId);
    return true;
  };

  const handleRequestClose = async () => {
    const captureNeedsReview = paymentResult ? isPaycloudCaptureUnderReview(paymentResult) : false;
    if (activePaymentId && !paymentResult && !captureNeedsReview) {
      const keepOpen = window.confirm(
        "A charge may still be open on the card machine.\n\nOK = keep it open (you can resume later)\nCancel = try to cancel the charge",
      );
      if (keepOpen) {
        onOpenChange(false);
        return;
      }
      await handleCancelCharge();
    }
    onOpenChange(false);
  };

  const handleProcessPayment = async () => {
    if (!selectedTerminalId) {
      toast.error("Please select a card machine");
      return;
    }
    const chargeAmount = amountEditable ? parseFloat(customAmount) : amount;
    if (isNaN(chargeAmount) || chargeAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);
    setPaymentResult(null);
    pollAbortRef.current?.abort();
    setIsPolling(false);

    try {
      const useSameTerminal =
        payOnThisDevice && sameTerminalAvailable && payMethod === "card";
      const channel: "cloud" | "same_terminal" = useSameTerminal ? "same_terminal" : "cloud";
      const bridge = channel === "same_terminal" ? getPaycloudSameTerminalBridge() : null;
      const deviceSerial =
        channel === "same_terminal" && bridge?.getDeviceSerial
          ? await bridge.getDeviceSerial().catch(() => null)
          : null;

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
        channel,
        device_serial: deviceSerial || undefined,
      });

      const paymentId = paymentRowId(created);
      if (created.reused) {
        toast.info("Resuming payment already in progress on this card machine");
      }

      if (isPaycloudPaymentTerminal(created.status)) {
        applySettledPayment(created);
        return;
      }

      if (channel === "same_terminal" && created.intent_payload && bridge) {
        setActivePaymentId(paymentId);
        toast.message("Opening card machine on this device…");
        try {
          const intentResult = await bridge.startSale(created.intent_payload as Record<string, unknown>);
          const approved =
            intentResult?.result === "00" ||
            (intentResult?.success === true && intentResult?.result == null);
          if (approved) {
            try {
              await paycloudApi.confirmPayment(paymentId, {
                intent_result: {
                  result: intentResult?.result,
                  resultMsg: intentResult?.message ?? intentResult?.resultMsg,
                  transData: intentResult?.transData as string | Record<string, unknown> | undefined,
                },
              });
            } catch {
              /* poll is source of truth */
            }
          } else {
            if (paymentId) {
              try {
                await paycloudApi.closePayment(paymentId);
              } catch {
                /* best-effort — terminal may already have closed */
              }
            }
            setActivePaymentId(null);
            const declineMessage =
              intentResult?.message ??
              (typeof intentResult?.resultMsg === "string" ? intentResult.resultMsg : undefined) ??
              "Payment not completed on this device.";
            if (offerCloudFallback(declineMessage)) {
              await pushCloudCharge(chargeAmount);
            } else {
              toast.error(declineMessage);
            }
            return;
          }
        } catch (intentErr) {
          if (paymentId) {
            try {
              await paycloudApi.closePayment(paymentId);
            } catch {
              /* best-effort */
            }
          }
          setActivePaymentId(null);
          const intentMessage =
            intentErr instanceof Error
              ? intentErr.message
              : "Could not open WiseCashier on this device.";
          if (offerCloudFallback(`${intentMessage}\n\nTry Send to card machine instead.`)) {
            await pushCloudCharge(chargeAmount);
          } else {
            toast.error(intentMessage);
          }
          return;
        }
        startPolling(paymentId);
        return;
      }

      startPolling(paymentId);
    } catch (error: unknown) {
      console.error("PayCloud payment failed:", error);
      const code = error instanceof FetchError ? error.code : undefined;
      if (code === "TERMINAL_IN_FLIGHT" || code === "ENTITY_IN_FLIGHT" || code === "POLL_TIMEOUT") {
        const resumeId =
          extractPaycloudInFlightPaymentId(error, terminals, selectedTerminalId) ?? activePaymentId;
        const resume = window.confirm(
          `${paycloudToastMessage(error, "Payment in progress")}\n\nResume waiting on the card machine?`,
        );
        if (resume && resumeId) {
          setActivePaymentId(resumeId);
          void handleResumeInFlight(resumeId);
        }
      } else {
        toast.error(paycloudToastMessage(error, "Could not reach the card machine — check it is online."));
      }
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
  const terminalInFlightId = selectedTerminal?.in_flight_payment_id ?? null;
  const showInFlightBanner = Boolean(activePaymentId || terminalInFlightId) && !paymentResult;
  const captureNeedsReview = isPaycloudCaptureUnderReview(paymentResult);
  const isSandboxMachine = selectedTerminal?.merchant?.environment === "sandbox";
  const waitingOnTerminal = isProcessing || isPolling;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : void handleRequestClose())}>
      <DialogContent className="sm:max-w-md" data-testid="paycloud-payment-dialog">
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
                    The card machine took a different amount than the balance due, so it was not applied
                    automatically. Resolve in card machine settings before marking the balance paid.
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
              <Link href="/provider/settings/sales/card-machines">Open card machine settings</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {showInFlightBanner ? (
              <Alert className="border-blue-200 bg-blue-50" data-testid="paycloud-in-flight-banner">
                <AlertDescription className="text-blue-900 text-sm">
                  <p className="font-semibold">Payment in progress on card machine</p>
                  <p className="mt-1 text-xs">
                    A charge is still open. Resume when the customer has paid, or cancel if they did not.
                    Returning to this tab also auto-checks status.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleResumeInFlight()}
                      disabled={waitingOnTerminal}
                      data-testid="paycloud-resume"
                    >
                      {waitingOnTerminal ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Waiting…
                        </>
                      ) : (
                        "Resume payment"
                      )}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleCancelCharge()}>
                      Cancel charge
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {sameTerminalAvailable && payMethod === "card" ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">Pay on this device</p>
                  <p className="text-xs text-gray-500">
                    Opens WiseCashier on this terminal (same as mobile app)
                  </p>
                </div>
                <Switch
                  checked={payOnThisDevice}
                  onCheckedChange={setPayOnThisDevice}
                  data-testid="paycloud-same-terminal-toggle"
                />
              </div>
            ) : sameTerminalAvailable && payMethod === "qr" ? (
              <p className="text-xs text-gray-500 rounded-md border bg-gray-50 px-3 py-2">
                QR payments are sent to the card machine in cloud mode.
              </p>
            ) : (
              <p className="text-xs text-gray-500 rounded-md border bg-gray-50 px-3 py-2">
                Send to card machine uses cloud ECR. Same-device WiseCashier is available in the
                Beautonomi Provider app on Android POS terminals.
              </p>
            )}

            {isSandboxMachine ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertDescription className="text-amber-900">
                  <div className="mb-1 inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                    TEST
                  </div>
                  <p className="mt-2 text-xs">
                    Test card machine — void charges when finished testing.
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
                        {t.in_flight_payment_id ? " · in progress" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {locationWarning ? (
                <p className="mt-1 text-xs text-amber-700">
                  {locationWarning}{" "}
                  <Link href="/provider/settings/sales/card-machines" className="font-medium underline underline-offset-2">
                    Card machine settings
                  </Link>
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="amount">Amount</Label>
              {amountEditable ? (
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="mt-1"
                  data-testid="paycloud-charge-amount"
                />
              ) : (
                <p
                  className="mt-1 rounded-md border bg-gray-50 px-3 py-2.5 text-lg font-semibold tabular-nums text-gray-900"
                  data-testid="paycloud-charge-amount"
                >
                  <Money amount={amount} currency={tenantCurrency} />
                </p>
              )}
            </div>

            {tipIncludedInAmount ? (
              <p className="rounded-md border bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Tip from checkout is already included in this amount.
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

            {waitingOnTerminal && !showInFlightBanner ? (
              <p className="text-xs text-gray-500 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting on card machine (polls every {PAYCLOUD_POLL_INTERVAL_MS / 1000}s)…
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {!paymentResult ? (
            <>
              <Button variant="outline" onClick={() => void handleRequestClose()} disabled={isProcessing && !isPolling}>
                {activePaymentId ? "Close" : "Cancel"}
              </Button>
              <Button
                onClick={handleProcessPayment}
                disabled={waitingOnTerminal || !selectedTerminalId || !paycloudReady || Boolean(activePaymentId)}
                data-testid="paycloud-charge-button"
              >
                {waitingOnTerminal ? (
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
              {(paymentResult.status === "successful" || captureNeedsReview) &&
              paymentResult.merchant_order_no ? (
                <Button variant="outline" onClick={() => void handleVoidOnTerminal()} disabled={voiding}>
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
