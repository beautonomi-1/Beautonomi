"use client";

import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { YocoDevice, YocoPayment } from "@/lib/provider-portal/types";
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
import { CreditCard, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Money } from "./Money";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

interface YocoPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number; // Major currency units (converted to cents server-side)
  appointmentId?: string;
  saleId?: string;
  onSuccess?: (payment: YocoPayment) => void;
}

export function YocoPaymentDialog({
  open,
  onOpenChange,
  amount,
  appointmentId,
  saleId,
  onSuccess,
}: YocoPaymentDialogProps) {
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [devices, setDevices] = useState<YocoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>(amount.toString());
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<YocoPayment | null>(null);

  useEffect(() => {
    if (open) {
      loadDevices();
      setCustomAmount(amount.toString());
      setPaymentResult(null);
    }
  }, [open, amount]);

  const loadDevices = async () => {
    try {
      const data = await providerApi.listYocoDevices();
      const activeDevices = data.filter((d) => d.is_active);
      setDevices(activeDevices);
      if (activeDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(activeDevices[0].id);
      }
    } catch (error) {
      console.error("Failed to load devices:", error);
      toast.error("Failed to load payment devices");
    }
  };

  const POLL_INTERVAL_MS = 3000;
  const POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

  const handleProcessPayment = async () => {
    if (!selectedDeviceId) {
      toast.error("Please select a payment device");
      return;
    }

    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      setIsProcessing(true);
      setPaymentResult(null);

      // API expects amount in major units (will convert to cents server-side)
      let payment = await providerApi.createYocoPayment({
        device_id: selectedDeviceId,
        amount: amount,
        currency: tenantCurrency,
        appointment_id: appointmentId,
        sale_id: saleId,
        metadata: {
          appointment_ref: appointmentId,
          sale_ref: saleId,
        },
      });

      // If pending, poll until success/fail or timeout (same behavior as provider app)
      if (payment.status === "pending" && payment.id) {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          try {
            const updated = await providerApi.getYocoPayment(payment.id);
            if (updated.status === "successful" || updated.status === "failed") {
              payment = updated;
              break;
            }
          } catch {
            // continue polling
          }
        }
      }

      setPaymentResult(payment);

      if (payment.status === "successful") {
        toast.success("Payment processed successfully!");
        onSuccess?.(payment);
        setTimeout(() => {
          onOpenChange(false);
        }, 2000);
      } else if (payment.status === "pending") {
        toast.error("Payment timed out. You can try again.");
      } else {
        toast.error(payment.error_message || "Payment failed");
      }
    } catch (error) {
      console.error("Payment processing failed:", error);
      toast.error("Failed to process payment");
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  const amountInCents = Math.round(parseFloat(customAmount) * 100) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Process Yoco Payment
          </DialogTitle>
          <DialogDescription>
            Process a card payment through your Yoco device
          </DialogDescription>
        </DialogHeader>

        {paymentResult ? (
          <div className="space-y-4 py-4">
            {paymentResult.status === "successful" ? (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <div className="font-semibold mb-1">Payment Successful!</div>
                  <div className="text-sm space-y-1">
                    <div>Payment ID: {paymentResult.yoco_payment_id}</div>
                    <div>Amount: <Money amount={paymentResult.amount / 100} /></div>
                    <div>Device: {paymentResult.device_name}</div>
                    {paymentResult.receipt_url && (
                      <div>
                        <a
                          href={paymentResult.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-pink-600 hover:underline font-medium"
                        >
                          View receipt
                        </a>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-red-50 border-red-200">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <div className="font-semibold mb-1">Payment Failed</div>
                  <div className="text-sm">
                    {paymentResult.error_message || "Payment could not be processed"}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="device">Payment Device</Label>
              {devices.length === 0 ? (
                <p id="device" className="mt-1 text-sm text-gray-500 rounded-md border border-input bg-background px-3 py-2">
                  No active devices available
                </p>
              ) : (
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger id="device" className="mt-1">
                    <SelectValue placeholder="Select a device" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name} {device.location_name && `(${device.location_name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {devices.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  <a
                    href="/provider/settings/sales/yoco-devices"
                    className="text-pink-600 hover:underline"
                  >
                    Add a device
                  </a>{" "}
                  to process payments
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="amount">Amount ({tenantCurrency})</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="mt-1"
                disabled={isProcessing}
              />
              <p className="text-xs text-gray-500 mt-1">
                Amount: <Money amount={amountInCents / 100} />
              </p>
            </div>

            {selectedDevice && (
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Device:</span>
                  <span className="font-medium">{selectedDevice.name}</span>
                </div>
                {selectedDevice.location_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Location:</span>
                    <span>{selectedDevice.location_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {paymentResult ? (
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={handleProcessPayment}
                disabled={isProcessing || !selectedDeviceId || devices.length === 0}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Process Payment
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
