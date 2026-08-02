"use client";

import type { Appointment } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingSectionCard, BookingSectionLabel, BookingSummaryRow } from "../ui";

interface BookingPaymentSummarySectionProps {
  appointment: Appointment;
  outstanding: number;
}

export function BookingPaymentSummarySection({
  appointment,
  outstanding,
}: BookingPaymentSummarySectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const raw = appointment as unknown as Record<string, unknown>;
  const totalAmount = Number(appointment.total_amount ?? appointment.price ?? 0);
  const totalPaid = Number(raw.total_paid ?? 0);
  const travelFee = Number(raw.travel_fee ?? raw.travel_fee_amount ?? 0);
  const tipAmount = Number(raw.tip_amount ?? 0);
  const discountAmount = Number(raw.discount_amount ?? 0);
  const depositRequired = Boolean(raw.deposit_required);
  const depositAmount = Number(raw.deposit_amount ?? 0);
  const paymentOption = String(raw.payment_option ?? "");
  const paymentStatus = (appointment.payment_status ?? "").toLowerCase();

  if (totalAmount <= 0 && outstanding <= 0 && totalPaid <= 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">Payment summary</BookingSectionLabel>
      {totalAmount > 0 ? <BookingSummaryRow label="Total" value={formatMoney(totalAmount)} /> : null}
      {discountAmount > 0 ? (
        <BookingSummaryRow label="Discount" value={`−${formatMoney(discountAmount)}`} />
      ) : null}
      {travelFee > 0 ? <BookingSummaryRow label="Travel fee" value={formatMoney(travelFee)} /> : null}
      {tipAmount > 0 ? <BookingSummaryRow label="Tip" value={formatMoney(tipAmount)} /> : null}
      {depositRequired && paymentOption === "deposit" && depositAmount > 0 ? (
        <BookingSummaryRow label="Deposit required" value={formatMoney(depositAmount)} />
      ) : null}
      {totalPaid > 0 ? <BookingSummaryRow label="Paid" value={formatMoney(totalPaid)} /> : null}
      {outstanding > 0 ? (
        <BookingSummaryRow label="Balance due" value={formatMoney(outstanding)} emphasize />
      ) : paymentStatus === "paid" ? (
        <BookingSummaryRow label="Status" value="Paid in full" />
      ) : null}
    </BookingSectionCard>
  );
}
