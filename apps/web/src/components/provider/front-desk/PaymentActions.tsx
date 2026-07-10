"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Link2, QrCode } from "lucide-react";
import { sendPaystackLink, createYocoTerminalPaymentAndMarkPaid } from "@/lib/front-desk/actions";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { PaystackTerminalCollectDialog } from "@/components/provider/PaystackTerminalCollectDialog";
import { PayCloudPaymentDialog } from "@/components/provider-portal/PayCloudPaymentDialog";
import { PaycloudCollectButton } from "@/components/provider-portal/PaycloudCollectButton";
import { fetcher } from "@/lib/http/fetcher";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import {
  formatPaycloudCollectLabel,
  inferBookingCollectContext,
  PAYCLOUD_SETUP_LABEL,
} from "@/lib/payments/paycloud-collect-cta";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import Link from "next/link";

interface PaymentActionsProps {
  bookingId: string;
  totalAmount: number;
  totalPaid: number;
  totalRefunded?: number;
  walletAmount?: number;
  giftCardAmount?: number;
  unpaidAdditionalCharges?: number;
  paymentStatus?: string;
  currency: string;
  onComplete: () => void;
  /** Salon location for at-salon bookings; null for house-call / portable path */
  bookingLocationId?: string | null;
  /** "footer" = large interactive tiles for Concierge Panel */
  variant?: "default" | "footer";
}

export function PaymentActions({
  bookingId,
  totalAmount,
  totalPaid,
  totalRefunded = 0,
  walletAmount = 0,
  giftCardAmount = 0,
  unpaidAdditionalCharges = 0,
  paymentStatus,
  currency,
  onComplete,
  bookingLocationId = null,
  variant = "default",
}: PaymentActionsProps) {
  const remaining = computeBookingOutstandingDisplay({
    totalAmount,
    totalPaid,
    totalRefunded,
    walletAmount,
    giftCardAmount,
    unpaidAdditionalCharges,
    paymentStatus,
  });
  const paymentLinkEnabled = useFeatureFlag("payment_link");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { ready: paycloudReady, loading: paycloudLoading, blockers, terminals } =
    usePaycloudCollectReady();
  const paycloudCollectContext = inferBookingCollectContext({
    totalAmount,
    totalPaid,
    unpaidAdditionalCharges,
    outstanding: remaining,
  });
  const [yocoOpen, setYocoOpen] = useState(false);
  const [paycloudOpen, setPaycloudOpen] = useState(false);
  const [yocoAmount, setYocoAmount] = useState(String(remaining));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetcher
      .get<{ data?: { paystackTerminal?: { selectable?: boolean } } }>(
        "/api/provider/settings/payments",
      )
      .then((res) => {
        if (!cancelled) setTerminalReady(Boolean(res.data?.paystackTerminal?.selectable));
      })
      .catch(() => {
        if (!cancelled) setTerminalReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isPaid = remaining <= 0;
  const chargeAmount = Number(remaining.toFixed(2));

  const handleSendPaystack = async () => {
    const ok = await sendPaystackLink(bookingId, "both");
    if (ok) onComplete();
  };

  const handleRecordYoco = async () => {
    const amt = parseFloat(yocoAmount);
    if (isNaN(amt) || amt <= 0) return;
    setIsSubmitting(true);
    try {
      const ok = await createYocoTerminalPaymentAndMarkPaid(bookingId, amt, currency);
      if (ok) {
        setYocoOpen(false);
        onComplete();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPaid) {
    return (
      <div className="rounded-[2.5rem] bg-emerald-50/90 border border-emerald-200/60 px-6 py-4 text-sm font-semibold text-emerald-800">
        Paid
      </div>
    );
  }

  const paycloudDialog = (
    <PayCloudPaymentDialog
      open={paycloudOpen}
      onOpenChange={setPaycloudOpen}
      amount={chargeAmount}
      entityType="booking"
      entityId={bookingId}
      bookingId={bookingId}
      bookingLocationId={bookingLocationId}
      onSuccess={() => {
        setPaycloudOpen(false);
        onComplete();
      }}
    />
  );

  if (variant === "footer") {
    return (
      <>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Balance due: {currency} {remaining.toFixed(2)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {paycloudEnabled && !paycloudLoading ? (
            paycloudReady || (terminals?.inFlight ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setPaycloudOpen(true)}
                className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
              >
                <CreditCard className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
                <span className="font-semibold text-[#0F172A] text-center text-sm px-2">
                  {formatPaycloudCollectLabel({
                    context: paycloudCollectContext,
                    amount: chargeAmount,
                    currency,
                    inFlight: (terminals?.inFlight ?? 0) > 0,
                  })}
                </span>
              </button>
            ) : (
              <Link
                href={blockers[0]?.href ?? "/provider/settings/sales/card-machines"}
                className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-dashed border-[#0F172A]/15 bg-white p-8 shadow-sm transition-all hover:border-[#0F172A]/25"
              >
                <CreditCard className="h-10 w-10 text-[#0F172A]/50" strokeWidth={1.5} />
                <span className="font-semibold text-[#0F172A]/70 text-center text-sm">{PAYCLOUD_SETUP_LABEL}</span>
              </Link>
            )
          ) : null}
          {yocoEnabled && (
            <button
              type="button"
              onClick={() => setYocoOpen(true)}
              className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
            >
              <CreditCard className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
              <span className="font-semibold text-[#0F172A]">Yoco Machine</span>
            </button>
          )}
          {paymentLinkEnabled && (
            <button
              type="button"
              onClick={handleSendPaystack}
              className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
            >
              <Link2 className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
              <span className="font-semibold text-[#0F172A]">Paystack Link</span>
            </button>
          )}
          {terminalReady && (
            <button
              type="button"
              onClick={() => setTerminalOpen(true)}
              className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
            >
              <QrCode className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
              <span className="font-semibold text-[#0F172A]">Paystack Terminal</span>
            </button>
          )}
        </div>
        <PaystackTerminalCollectDialog
          open={terminalOpen}
          onOpenChange={setTerminalOpen}
          entityType="booking"
          entityId={bookingId}
          expectedAmount={chargeAmount}
          currency={currency}
        />
        {paycloudDialog}
        <Dialog open={yocoOpen} onOpenChange={setYocoOpen}>
          <DialogContent className="rounded-[2.5rem] border-[#0F172A]/10 shadow-[0_25px_60px_rgba(0,0,0,0.15)]">
            <DialogHeader>
              <DialogTitle className="text-[#0F172A]">Record Yoco Terminal Payment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-[#0F172A]/80">Amount ({currency})</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={yocoAmount}
                  onChange={(e) => setYocoAmount(e.target.value)}
                  placeholder={String(remaining.toFixed(2))}
                  className="mt-2 rounded-2xl border-[#0F172A]/12"
                />
                <p className="text-xs text-[#0F172A]/50 mt-1.5">
                  Remaining: {currency} {remaining.toFixed(2)}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setYocoOpen(false)} className="rounded-2xl border-[#0F172A]/12">
                Cancel
              </Button>
              <Button onClick={handleRecordYoco} disabled={isSubmitting} className="rounded-2xl bg-[#0F172A] hover:bg-[#0F172A]/90 text-white">
                {isSubmitting ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#0F172A]/50">Payments</p>
        <div className="flex flex-wrap gap-2">
          <PaycloudCollectButton
            amount={chargeAmount}
            currency={currency}
            context={paycloudCollectContext}
            onClick={() => setPaycloudOpen(true)}
            className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]"
          />
          {paymentLinkEnabled && (
            <Button variant="outline" size="sm" className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]" onClick={handleSendPaystack}>
              <Link2 className="h-4 w-4" />
              Send Paystack Link
            </Button>
          )}
          {yocoEnabled && (
            <Button variant="outline" size="sm" className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]" onClick={() => setYocoOpen(true)}>
              <CreditCard className="h-4 w-4" />
              Record Yoco Payment
            </Button>
          )}
          {terminalReady && (
            <Button variant="outline" size="sm" className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]" onClick={() => setTerminalOpen(true)}>
              <QrCode className="h-4 w-4" />
              Paystack Terminal
            </Button>
          )}
        </div>
        <PaystackTerminalCollectDialog
          open={terminalOpen}
          onOpenChange={setTerminalOpen}
          entityType="booking"
          entityId={bookingId}
          expectedAmount={chargeAmount}
          currency={currency}
        />
      </div>
      {paycloudDialog}
      <Dialog open={yocoOpen} onOpenChange={setYocoOpen}>
        <DialogContent className="rounded-[2.5rem] border-[#0F172A]/10 shadow-[0_25px_60px_rgba(0,0,0,0.15)]">
          <DialogHeader>
            <DialogTitle className="text-[#0F172A]">Record Yoco Terminal Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-[#0F172A]/80">Amount ({currency})</Label>
              <Input type="number" min={0} step={0.01} value={yocoAmount} onChange={(e) => setYocoAmount(e.target.value)} placeholder={String(remaining.toFixed(2))} className="mt-2 rounded-2xl border-[#0F172A]/12" />
              <p className="text-xs text-[#0F172A]/50 mt-1.5">Remaining: {currency} {remaining.toFixed(2)}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setYocoOpen(false)} className="rounded-2xl border-[#0F172A]/12">Cancel</Button>
            <Button onClick={handleRecordYoco} disabled={isSubmitting} className="rounded-2xl bg-[#0F172A] hover:bg-[#0F172A]/90 text-white">
              {isSubmitting ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
