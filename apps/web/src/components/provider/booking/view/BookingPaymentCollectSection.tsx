"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Banknote, Link2 } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { manualCardCollectOptionLabel } from "@beautonomi/utils";
import { usePaycloudCollectReady } from "@/hooks/usePaycloudCollectReady";
import { usePermissions } from "@/hooks/usePermissions";
import { inferBookingCollectContext } from "@/lib/payments/paycloud-collect-cta";
import { computePaycloudBookingChargeAmount, paycloudTipIncludedInChargeAmount } from "@/lib/payments/paycloud-booking-charge";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import type { Appointment } from "@/lib/provider-portal/types";
import { PaycloudCollectButton } from "@/components/provider-portal/PaycloudCollectButton";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";
import { PermissionGateInline } from "../scenario/PermissionGateInline";
import { PaystackTerminalCollectDialog } from "./PaystackTerminalCollectDialog";
import { BookingSendPaymentLinkDialog } from "./BookingSendPaymentLinkDialog";

const PayCloudPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/PayCloudPaymentDialog").then((m) => ({
      default: m.PayCloudPaymentDialog,
    })),
  { ssr: false },
);

const YocoPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/YocoPaymentDialog").then((m) => ({
      default: m.YocoPaymentDialog,
    })),
  { ssr: false },
);

interface BookingPaymentCollectSectionProps {
  appointment: Appointment;
  onUpdated?: () => void;
  initialOpenYoco?: boolean;
  initialOpenPaycloud?: boolean;
  initialOpenPaystack?: boolean;
}

export function BookingPaymentCollectSection({
  appointment,
  onUpdated,
  initialOpenYoco = false,
  initialOpenPaycloud = false,
  initialOpenPaystack = false,
}: BookingPaymentCollectSectionProps) {
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const paystackEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const paymentLinkEnabled = useFeatureFlag("payment_link");
  const manualCardEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.PAYMENT_MANUAL_CARD);
  const { terminals } = usePaycloudCollectReady();
  const { hasPermission, isOwner } = usePermissions();
  const canProcessPayments = isOwner || hasPermission("process_payments");

  const [paycloudOpen, setPaycloudOpen] = useState(initialOpenPaycloud);
  const [yocoOpen, setYocoOpen] = useState(initialOpenYoco);
  const [paystackOpen, setPaystackOpen] = useState(initialOpenPaystack);
  const [paystackReady, setPaystackReady] = useState(false);
  const [markingCash, setMarkingCash] = useState(false);
  const [markingCard, setMarkingCard] = useState(false);
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);

  useEffect(() => {
    if (!paystackEnabled) return;
    let cancelled = false;
    fetcher
      .get<{
        data?: {
          paystackTerminal?: { selectable?: boolean; isEnabled?: boolean; activeTerminalCount?: number };
        };
      }>("/api/provider/settings/payments")
      .then((response) => {
        const terminal = response.data?.paystackTerminal;
        const ready =
          terminal?.selectable ??
          Boolean(terminal?.isEnabled && (terminal.activeTerminalCount ?? 0) > 0);
        if (!cancelled) setPaystackReady(ready);
      })
      .catch(() => {
        if (!cancelled) setPaystackReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paystackEnabled]);

  const raw = appointment as unknown as Record<string, unknown>;

  const { outstanding, chargeAmount, depositAmount, fullOutstanding, paycloudContext } =
    useMemo(() => {
      const unpaidAdditional = Number(raw.unpaid_additional_charges ?? 0);
      const outstandingDisplay = computeBookingOutstandingDisplay({
        totalAmount: Number(appointment.total_amount ?? appointment.price ?? 0),
        totalPaid: Number(raw.total_paid ?? 0),
        totalRefunded: Number(raw.total_refunded ?? 0),
        walletAmount: Number(raw.wallet_amount ?? 0),
        giftCardAmount: Number(raw.gift_card_amount ?? 0),
        unpaidAdditionalCharges: unpaidAdditional,
        paymentStatus: appointment.payment_status,
      });
      const charge = computePaycloudBookingChargeAmount({
        outstanding: outstandingDisplay,
        depositRequired: Boolean(raw.deposit_required),
        depositAmount: Number(raw.deposit_amount ?? 0),
        totalPaid: Number(raw.total_paid ?? 0),
        unpaidAdditionalCharges: unpaidAdditional,
      });
      const context = inferBookingCollectContext({
        totalAmount: Number(appointment.total_amount ?? 0),
        totalPaid: Number(raw.total_paid ?? 0),
        unpaidAdditionalCharges: unpaidAdditional,
        outstanding: outstandingDisplay,
      });
      return {
        outstanding: outstandingDisplay,
        chargeAmount: Number(charge.chargeAmount.toFixed(2)),
        depositAmount: charge.depositAmount,
        fullOutstanding: charge.fullOutstanding,
        paycloudContext: context,
      };
    }, [appointment, raw]);

  const customerEmail =
    (raw.customer_email as string | undefined) ?? appointment.client_email ?? null;
  const customerPhone =
    (raw.customer_phone as string | undefined) ?? appointment.client_phone ?? null;
  const canSendPaymentLink =
    paymentLinkEnabled &&
    outstanding > 0 &&
    appointment.payment_status !== "paid" &&
    appointment.status !== "cancelled" &&
    !!(customerEmail || customerPhone);

  const handlePaid = useCallback(() => {
    onUpdated?.();
  }, [onUpdated]);

  const handleMarkPaid = async (method: "cash" | "card") => {
    const amount = chargeAmount > 0 ? chargeAmount : Number(outstanding.toFixed(2));
    if (amount <= 0) {
      toast.error("There is no remaining balance on this booking.");
      return;
    }
    const setBusy = method === "cash" ? setMarkingCash : setMarkingCard;
    setBusy(true);
    try {
      await fetcher.post(`/api/provider/bookings/${appointment.id}/mark-paid`, {
        payment_method: method,
        amount,
        settle_additional_charges: true,
      });
      toast.success("Booking marked as paid");
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to mark as paid");
    } finally {
      setBusy(false);
    }
  };

  if (outstanding <= 0) return null;

  const terminalAmount = chargeAmount > 0 ? chargeAmount : outstanding;
  const paycloudInFlight = (terminals?.inFlight ?? 0) > 0;

  return (
    <PermissionGateInline allowed={canProcessPayments} message="You do not have permission to collect payments.">
      <BookingSectionCard data-testid="booking-collect-payment">
        <BookingSectionLabel className="mb-3 flex items-center gap-1.5">
          <CreditCard className="h-4 w-4" />
          Collect payment
        </BookingSectionLabel>
        {depositAmount != null && depositAmount > 0 ? (
          <p className="text-xs text-gray-600 mb-2">
            Deposit due now · {depositAmount.toFixed(2)} of {fullOutstanding.toFixed(2)} outstanding
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          {paycloudEnabled ? (
            <PaycloudCollectButton
              amount={terminalAmount}
              currency="ZAR"
              context={paycloudContext}
              inFlight={paycloudInFlight}
              depositAmount={depositAmount}
              fullOutstanding={fullOutstanding}
              onClick={() => {
                if (terminalAmount <= 0) {
                  toast.error("There is no remaining balance to collect.");
                  return;
                }
                setPaycloudOpen(true);
              }}
              className="w-full justify-center min-h-[44px]"
              size="default"
            />
          ) : null}
          {yocoEnabled ? (
            <BookingActionButton variant="outline" onClick={() => setYocoOpen(true)}>
              Collect with Yoco · {terminalAmount.toFixed(2)}
            </BookingActionButton>
          ) : null}
          {paystackEnabled && paystackReady ? (
            <BookingActionButton variant="outline" onClick={() => setPaystackOpen(true)}>
              Paystack Terminal
            </BookingActionButton>
          ) : null}
          <BookingActionButton
            variant="outline"
            disabled={markingCash}
            onClick={() => void handleMarkPaid("cash")}
          >
            <Banknote className="mr-2 h-4 w-4" />
            {markingCash ? "Recording…" : `Mark paid (cash) · ${terminalAmount.toFixed(2)}`}
          </BookingActionButton>
          {manualCardEnabled ? (
            <BookingActionButton
              variant="outline"
              disabled={markingCard}
              onClick={() => void handleMarkPaid("card")}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {markingCard ? "Recording…" : `${manualCardCollectOptionLabel()} · ${terminalAmount.toFixed(2)}`}
            </BookingActionButton>
          ) : null}
          {canSendPaymentLink ? (
            <BookingActionButton variant="outline" onClick={() => setPaymentLinkOpen(true)}>
              <Link2 className="mr-2 h-4 w-4" />
              Send payment link
            </BookingActionButton>
          ) : null}
        </div>

        <PayCloudPaymentDialog
          open={paycloudOpen}
          onOpenChange={setPaycloudOpen}
          entityType="booking"
          entityId={appointment.id}
          bookingId={appointment.id}
          amount={terminalAmount}
          bookingLocationId={appointment.location_id ?? null}
          tipIncludedInAmount={paycloudTipIncludedInChargeAmount(Number(raw.tip_amount ?? 0))}
          onSuccess={handlePaid}
        />

        {yocoOpen ? (
          <YocoPaymentDialog
            open={yocoOpen}
            onOpenChange={setYocoOpen}
            bookingId={appointment.id}
            amount={terminalAmount}
            bookingLocationId={appointment.location_id}
            onSuccess={handlePaid}
          />
        ) : null}

        <PaystackTerminalCollectDialog
          open={paystackOpen}
          onOpenChange={setPaystackOpen}
          appointment={appointment}
          onSuccess={handlePaid}
        />

        <BookingSendPaymentLinkDialog
          open={paymentLinkOpen}
          onOpenChange={setPaymentLinkOpen}
          bookingId={appointment.id}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          onSuccess={handlePaid}
        />
      </BookingSectionCard>
    </PermissionGateInline>
  );
}
