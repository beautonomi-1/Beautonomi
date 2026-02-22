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
import { CreditCard, Link2 } from "lucide-react";
import { sendPaystackLink, recordYocoPayment } from "@/lib/front-desk/actions";

interface PaymentActionsProps {
  bookingId: string;
  totalAmount: number;
  totalPaid: number;
  currency: string;
  onComplete: () => void;
  /** "footer" = large interactive tiles for Concierge Panel */
  variant?: "default" | "footer";
}

export function PaymentActions({
  bookingId,
  totalAmount,
  totalPaid,
  currency,
  onComplete,
  variant = "default",
}: PaymentActionsProps) {
  const [yocoOpen, setYocoOpen] = useState(false);
  const [yocoAmount, setYocoAmount] = useState(String(Math.max(0, totalAmount - totalPaid)));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remaining = Math.max(0, totalAmount - totalPaid);
  const isPaid = totalPaid >= totalAmount;

  const handleSendPaystack = async () => {
    const ok = await sendPaystackLink(bookingId, "both");
    if (ok) onComplete();
  };

  const handleRecordYoco = async () => {
    const amt = parseFloat(yocoAmount);
    if (isNaN(amt) || amt <= 0) return;
    setIsSubmitting(true);
    try {
      const ok = await recordYocoPayment(bookingId, amt);
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

  if (variant === "footer") {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setYocoOpen(true)}
            className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
          >
            <CreditCard className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
            <span className="font-semibold text-[#0F172A]">Yoco Machine</span>
          </button>
          <button
            type="button"
            onClick={handleSendPaystack}
            className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
          >
            <Link2 className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
            <span className="font-semibold text-[#0F172A]">Paystack Link</span>
          </button>
        </div>
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
              <Button
                variant="outline"
                onClick={() => setYocoOpen(false)}
                className="rounded-2xl border-[#0F172A]/12"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordYoco}
                disabled={isSubmitting}
                className="rounded-2xl bg-[#0F172A] hover:bg-[#0F172A]/90 text-white"
              >
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
        <p className="text-[9px] font-black uppercase tracking-widest text-[#0F172A]/50">
          Payments
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]"
            onClick={handleSendPaystack}
          >
            <Link2 className="h-4 w-4" />
            Send Paystack Link
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]"
            onClick={() => setYocoOpen(true)}
          >
            <CreditCard className="h-4 w-4" />
            Record Yoco Payment
          </Button>
        </div>
      </div>
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
            <Button
              variant="outline"
              onClick={() => setYocoOpen(false)}
              className="rounded-2xl border-[#0F172A]/12"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordYoco}
              disabled={isSubmitting}
              className="rounded-2xl bg-[#0F172A] hover:bg-[#0F172A]/90 text-white"
            >
              {isSubmitting ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
