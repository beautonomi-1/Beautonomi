"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
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
import { sendPaystackLink, recordYocoPayment } from "@/lib/front-desk/actions";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { PaystackTerminalCollectDialog } from "@/components/provider/PaystackTerminalCollectDialog";
import { fetcher } from "@/lib/http/fetcher";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { paycloudTipIncludedInChargeAmount } from "@/lib/payments/paycloud-booking-charge";
import { useTranslation } from "@beautonomi/i18n";

const CardMachineCollectDialog = dynamic(
  () =>
    import("@/components/provider-portal/CardMachineCollectDialog").then((m) => ({
      default: m.CardMachineCollectDialog,
    })),
  { ssr: false },
);

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
  bookingLocationId?: string | null;
  tipAmount?: number | null;
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
  tipAmount = null,
  variant = "default",
}: PaymentActionsProps) {
  const { t } = useTranslation();
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
  const cardMachineEnabled = yocoEnabled || paycloudEnabled;
  const [cardMachineOpen, setCardMachineOpen] = useState(false);
  const [yocoRecordOpen, setYocoRecordOpen] = useState(false);
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

  const handleRecordYocoManual = async () => {
    const amt = parseFloat(yocoAmount);
    if (isNaN(amt) || amt <= 0) return;
    setIsSubmitting(true);
    try {
      const ok = await recordYocoPayment(bookingId, amt);
      if (ok) {
        setYocoRecordOpen(false);
        onComplete();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPaid) {
    return (
      <div className="rounded-[2.5rem] bg-emerald-50/90 border border-emerald-200/60 px-6 py-4 text-sm font-semibold text-emerald-800">
        {t("web.provider.bookings.detail.paymentActions.paid")}
      </div>
    );
  }

  const cardMachineDialog = cardMachineEnabled ? (
    <CardMachineCollectDialog
      open={cardMachineOpen}
      onOpenChange={setCardMachineOpen}
      amount={chargeAmount}
      autoStart
      tipIncludedInAmount={paycloudTipIncludedInChargeAmount(tipAmount)}
      entity={{
        entityType: "booking",
        entityId: bookingId,
        bookingId,
        bookingLocationId,
      }}
      onSuccess={() => {
        setCardMachineOpen(false);
        onComplete();
      }}
    />
  ) : null;

  if (variant === "footer") {
    return (
      <>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {t("web.provider.bookings.detail.paymentActions.balanceDue", { currency, amount: remaining.toFixed(2) })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {cardMachineEnabled ? (
            <button
              type="button"
              onClick={() => setCardMachineOpen(true)}
              className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
            >
              <CreditCard className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
              <span className="font-semibold text-[#0F172A] text-center text-sm px-2">
                {t("web.provider.bookings.detail.paymentCollect.cardMachine", {
                  amount: chargeAmount.toFixed(2),
                })}
              </span>
            </button>
          ) : null}
          {paymentLinkEnabled && (
            <button
              type="button"
              onClick={handleSendPaystack}
              className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
            >
              <Link2 className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
              <span className="font-semibold text-[#0F172A]">{t("web.provider.bookings.detail.paymentActions.paystackLink")}</span>
            </button>
          )}
          {terminalReady && (
            <button
              type="button"
              onClick={() => setTerminalOpen(true)}
              className="flex flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-[#0F172A]/10 bg-white p-8 shadow-sm transition-all duration-300 hover:border-[#0F172A]/20 hover:shadow-lg active:scale-[0.98]"
            >
              <QrCode className="h-10 w-10 text-[#0F172A]" strokeWidth={1.5} />
              <span className="font-semibold text-[#0F172A]">{t("web.provider.bookings.detail.paymentActions.paystackTerminal")}</span>
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
        {cardMachineDialog}
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#0F172A]/50">{t("web.provider.bookings.detail.paymentActions.payments")}</p>
        <div className="flex flex-wrap gap-2">
          {cardMachineEnabled ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]"
              onClick={() => setCardMachineOpen(true)}
            >
              <CreditCard className="h-4 w-4" />
              {t("web.provider.bookings.detail.paymentCollect.cardMachine", {
                amount: chargeAmount.toFixed(2),
              })}
            </Button>
          ) : null}
          {paymentLinkEnabled && (
            <Button variant="outline" size="sm" className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]" onClick={handleSendPaystack}>
              <Link2 className="h-4 w-4" />
              {t("web.provider.bookings.detail.paymentActions.sendPaystackLink")}
            </Button>
          )}
          {yocoEnabled && (
            <Button variant="outline" size="sm" className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]" onClick={() => setYocoRecordOpen(true)}>
              <CreditCard className="h-4 w-4" />
              {t("web.provider.bookings.detail.paymentActions.recordYocoPayment")}
            </Button>
          )}
          {terminalReady && (
            <Button variant="outline" size="sm" className="h-11 gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]" onClick={() => setTerminalOpen(true)}>
              <QrCode className="h-4 w-4" />
              {t("web.provider.bookings.detail.paymentActions.paystackTerminal")}
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
      {cardMachineDialog}
      <Dialog open={yocoRecordOpen} onOpenChange={setYocoRecordOpen}>
        <DialogContent className="rounded-[2.5rem] border-[#0F172A]/10 shadow-[0_25px_60px_rgba(0,0,0,0.15)]">
          <DialogHeader>
            <DialogTitle className="text-[#0F172A]">{t("web.provider.bookings.detail.paymentActions.recordYocoTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-[#0F172A]/80">{t("web.provider.bookings.detail.paymentActions.amountWithCurrency", { currency })}</Label>
              <Input type="number" min={0} step={0.01} value={yocoAmount} onChange={(e) => setYocoAmount(e.target.value)} placeholder={String(remaining.toFixed(2))} className="mt-2 rounded-2xl border-[#0F172A]/12" />
              <p className="text-xs text-[#0F172A]/50 mt-1.5">{t("web.provider.bookings.detail.paymentActions.remaining", { currency, amount: remaining.toFixed(2) })}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setYocoRecordOpen(false)} className="rounded-2xl border-[#0F172A]/12">{t("web.provider.bookings.detail.paymentActions.cancel")}</Button>
            <Button onClick={handleRecordYocoManual} disabled={isSubmitting} className="rounded-2xl bg-[#0F172A] hover:bg-[#0F172A]/90 text-white">
              {isSubmitting ? t("web.provider.bookings.detail.paymentActions.recording") : t("web.provider.bookings.detail.paymentActions.recordPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
