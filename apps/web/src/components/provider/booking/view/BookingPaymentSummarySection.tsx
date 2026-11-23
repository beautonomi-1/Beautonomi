"use client";

import {
  bookingAddonLineLabel,
  bookingProductLineLabel,
  collectBookingAddonLines,
  collectBookingProductLines,
  getBookingPaymentDisplay,
} from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
  const raw = appointment as unknown as Record<string, unknown>;
  const totalAmount = Number(appointment.total_amount ?? appointment.price ?? 0);
  const totalPaid = Number(raw.total_paid ?? 0);
  const travelFee = Number(raw.travel_fee ?? raw.travel_fee_amount ?? 0);
  const tipAmount = Number(raw.tip_amount ?? 0);
  const discountAmount = Number(raw.discount_amount ?? 0);
  const promotionDiscount = Number(raw.promotion_discount_amount ?? 0);
  const membershipDiscount = Number(raw.membership_discount_amount ?? 0);
  const loyaltyDiscount = Number(raw.loyalty_discount_amount ?? 0);
  const taxAmount = Number(raw.tax_amount ?? 0);
  const platformFee = Number(
    raw.platform_fee_amount ?? raw.service_fee_amount ?? raw.platform_service_fee ?? 0,
  );
  const subtotal = Number(raw.subtotal ?? 0);
  const addonLines = collectBookingAddonLines(raw);
  const productLines = collectBookingProductLines(raw);
  const depositRequired = Boolean(raw.deposit_required);
  const depositAmount = Number(raw.deposit_amount ?? 0);
  const paymentOption = String(raw.payment_option ?? "");
  const paymentStatus = (appointment.payment_status ?? "").toLowerCase();
  const paymentDisplay = getBookingPaymentDisplay({
    paymentStatus,
    outstandingBalance: outstanding,
    paymentOption,
    depositRequired,
  });

  if (totalAmount <= 0 && outstanding <= 0 && totalPaid <= 0 && addonLines.length === 0 && productLines.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">{t("web.provider.bookings.detail.paymentSummaryBlock.title")}</BookingSectionLabel>
      {addonLines.map((line) => (
        <BookingSummaryRow key={line.id} label={bookingAddonLineLabel(line)} value={formatMoney(line.totalPrice)} />
      ))}
      {productLines.map((line) => (
        <BookingSummaryRow key={line.id} label={bookingProductLineLabel(line)} value={formatMoney(line.totalPrice)} />
      ))}
      {subtotal > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.subtotal")} value={formatMoney(subtotal)} />
      ) : null}
      {discountAmount > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.discount")} value={`−${formatMoney(discountAmount)}`} />
      ) : null}
      {promotionDiscount > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.promotion")} value={`−${formatMoney(promotionDiscount)}`} />
      ) : null}
      {membershipDiscount > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.membership")} value={`−${formatMoney(membershipDiscount)}`} />
      ) : null}
      {loyaltyDiscount > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.loyalty")} value={`−${formatMoney(loyaltyDiscount)}`} />
      ) : null}
      {travelFee > 0 ? <BookingSummaryRow label={t("web.provider.bookings.detail.paymentDetails.travelFee")} value={formatMoney(travelFee)} /> : null}
      {taxAmount > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.taxAmount")} value={formatMoney(taxAmount)} />
      ) : null}
      {platformFee > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.platformFee")} value={formatMoney(platformFee)} />
      ) : null}
      {platformFee > 0 && totalPaid > 0 && outstanding > 0 ? (
        <p className="text-xs text-gray-500 pb-1">{t("web.provider.bookings.detail.paymentSummaryBlock.platformFeeOnlineNote")}</p>
      ) : null}
      {tipAmount > 0 ? <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.tip")} value={formatMoney(tipAmount)} /> : null}
      {totalAmount > 0 ? <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummary.total")} value={formatMoney(totalAmount)} /> : null}
      {depositRequired && paymentOption === "deposit" && depositAmount > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentDetails.depositRequired")} value={formatMoney(depositAmount)} />
      ) : null}
      {totalPaid > 0 ? <BookingSummaryRow label={t("web.provider.bookings.detail.paymentActions.paid")} value={formatMoney(totalPaid)} /> : null}
      {outstanding > 0 ? (
        <BookingSummaryRow label={t("web.provider.bookings.detail.paymentSummaryBlock.balanceDue")} value={formatMoney(outstanding)} emphasize />
      ) : null}
      <BookingSummaryRow
        label={t("web.provider.bookings.detail.paymentSummaryBlock.statusLabel")}
        value={paymentDisplay.label}
      />
    </BookingSectionCard>
  );
}
