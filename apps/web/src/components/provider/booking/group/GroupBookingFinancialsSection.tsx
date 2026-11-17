"use client";
import { multiplyMoney } from "@beautonomi/utils";

import { ShoppingBag } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import type { GroupBooking, GroupBookingParticipant } from "@/lib/provider-portal/types";
import { computeGroupFinancials, participantShareOwed } from "@/lib/provider-booking/group-booking-utils";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingSectionCard, BookingSectionLabel, BookingSummaryRow } from "../ui";

interface GroupBookingFinancialsSectionProps {
  booking: GroupBooking;
  participants: GroupBookingParticipant[];
  outstanding: number;
  /** Compact layout for mobile shell sheets */
  variant?: "sheet" | "panel";
}

export function GroupBookingFinancialsSection({
  booking,
  participants,
  outstanding,
  variant = "sheet",
}: GroupBookingFinancialsSectionProps) {
  const { t } = useTranslation();
  const { format: formatMoney } = useProviderMoneyFormat();
  const financials = computeGroupFinancials(participants, booking);
  const raw = booking as unknown as Record<string, unknown>;
  const travelFee = Number(raw.travel_fee ?? 0);
  const totalPrice = Number(booking.total_price ?? 0);
  const totalLabel =
    participants.length === 0
      ? t("web.provider.bookings.groupFinancials.sessionEstimate")
      : t("web.provider.bookings.groupFinancials.total");

  if (variant === "panel") {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          {t("web.provider.bookings.groupFinancials.title")}
        </h3>
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{t("web.provider.bookings.groupFinancials.participantsPaid")}</span>
            <span className="font-medium">
              {financials.paidParticipants}/{participants.length}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t("web.provider.bookings.groupFinancials.participantServices")}</span>
            <span className="font-medium">{formatMoney(financials.participantRevenue)}</span>
          </div>
          {financials.groupProductTotal > 0 ? (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.provider.bookings.groupFinancials.products")}</span>
              <span className="font-medium">{formatMoney(financials.groupProductTotal)}</span>
            </div>
          ) : null}
          {financials.participantTips > 0 ? (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.provider.bookings.groupFinancials.tips")}</span>
              <span className="font-medium">{formatMoney(financials.participantTips)}</span>
            </div>
          ) : null}
          {financials.participantCollected > 0 ? (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.provider.bookings.groupFinancials.collectedNet")}</span>
              <span className="font-medium">{formatMoney(financials.participantCollected)}</span>
            </div>
          ) : null}
          {travelFee > 0 ? (
            <div className="flex justify-between">
              <span className="text-gray-600">{t("web.provider.bookings.groupFinancials.travelFee")}</span>
              <span className="font-medium">{formatMoney(travelFee)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>{totalLabel}</span>
            <span>{formatMoney(totalPrice)}</span>
          </div>
          {outstanding > 0 ? (
            <div className="flex justify-between text-amber-800">
              <span>{t("web.provider.bookings.groupFinancials.outstanding")}</span>
              <span className="font-semibold">{formatMoney(outstanding)}</span>
            </div>
          ) : null}
        </div>
        {financials.groupProducts.length > 0 ? (
          <>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
              <ShoppingBag className="h-4 w-4" />
              {t("web.provider.bookings.groupFinancials.products")}
            </h3>
            <ul className="space-y-2 text-sm bg-gray-50 rounded-xl p-4">
              {financials.groupProducts.map((product, index) => {
                const quantity = Number(product?.quantity ?? 1) || 1;
                const name = String(
                  product?.product_name ??
                    product?.productName ??
                    t("web.provider.bookings.groupFinancials.productFallback", { index: index + 1 }),
                );
                const total =
                  Number(product?.total_price ?? product?.totalPrice) ||
                  multiplyMoney(Number(product?.unit_price ?? product?.unitPrice ?? 0), quantity);
                return (
                  <li key={`${name}-${index}`} className="flex justify-between gap-2">
                    <span>
                      {t("web.provider.bookings.groupFinancials.productQty", { name, quantity })}
                    </span>
                    <span className="font-medium">{formatMoney(total)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <BookingSectionCard>
        <BookingSectionLabel className="mb-2">{t("web.provider.bookings.groupFinancials.title")}</BookingSectionLabel>
        <BookingSummaryRow
          label={t("web.provider.bookings.groupFinancials.participantsPaid")}
          value={`${financials.paidParticipants}/${participants.length}`}
        />
        <BookingSummaryRow
          label={t("web.provider.bookings.groupFinancials.participantServices")}
          value={formatMoney(financials.participantRevenue)}
        />
        {financials.groupProductTotal > 0 ? (
          <BookingSummaryRow
            label={t("web.provider.bookings.groupFinancials.products")}
            value={formatMoney(financials.groupProductTotal)}
          />
        ) : null}
        {financials.participantTips > 0 ? (
          <BookingSummaryRow
            label={t("web.provider.bookings.groupFinancials.tips")}
            value={formatMoney(financials.participantTips)}
          />
        ) : null}
        {financials.participantCollected > 0 ? (
          <BookingSummaryRow
            label={t("web.provider.bookings.groupFinancials.collected")}
            value={formatMoney(financials.participantCollected)}
          />
        ) : null}
        {travelFee > 0 ? (
          <BookingSummaryRow
            label={t("web.provider.bookings.groupFinancials.travelFee")}
            value={formatMoney(travelFee)}
          />
        ) : null}
        <BookingSummaryRow label={totalLabel} value={formatMoney(totalPrice)} emphasize />
        {outstanding > 0 ? (
          <BookingSummaryRow
            label={t("web.provider.bookings.groupFinancials.outstanding")}
            value={formatMoney(outstanding)}
            emphasize
          />
        ) : null}
      </BookingSectionCard>

      {participants.length > 0 ? (
        <BookingSectionCard>
          <BookingSectionLabel className="mb-2">{t("web.provider.bookings.groupFinancials.guests")}</BookingSectionLabel>
          <ul className="divide-y divide-gray-100 text-sm" data-testid="group-guest-payments">
            {participants.map((participant) => {
              const paid = Number(participant.total_paid ?? 0);
              const refunded = Number(participant.total_refunded ?? 0);
              const balanceDue = Math.max(0, Number(participant.balance_due ?? 0));
              const inactive = ["cancelled", "no_show"].includes(
                String(participant.booking_status ?? "").toLowerCase(),
              );
              const shareStatus = String(participant.share_status ?? "").toLowerCase();
              const shareOwed = participantShareOwed(participant);
              return (
                <li key={participant.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{participant.client_name}</span>
                    <span className={`shrink-0 font-medium ${!inactive && balanceDue > 0.01 ? "text-amber-800" : "text-green-700"}`}>
                      {inactive
                        ? t("web.provider.bookings.groupFinancials.guestInactive")
                        : balanceDue > 0.01
                          ? t("web.provider.bookings.groupFinancials.guestBalanceDue", { amount: formatMoney(balanceDue) })
                          : t("web.provider.bookings.groupFinancials.guestSettled")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t("web.provider.bookings.groupFinancials.guestPaid", { amount: formatMoney(paid) })}
                    {refunded > 0.009
                      ? ` · ${t("web.provider.bookings.groupFinancials.guestRefunded", { amount: formatMoney(refunded) })}`
                      : ""}
                    {participant.share_amount_due != null && !participant.is_primary_contact
                      ? ` · ${
                          shareStatus === "paid"
                            ? t("web.provider.bookings.groupFinancials.shareSettled")
                            : shareStatus === "cancelled" || shareStatus === "waived"
                              ? t("web.provider.bookings.groupFinancials.shareClosed")
                              : t("web.provider.bookings.groupFinancials.shareOwed", { amount: formatMoney(shareOwed) })
                        }`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </BookingSectionCard>
      ) : null}

      {financials.groupProducts.length > 0 ? (
        <BookingSectionCard>
          <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
            <ShoppingBag className="h-4 w-4" />
            {t("web.provider.bookings.groupFinancials.products")}
          </BookingSectionLabel>
          <ul className="space-y-2 text-sm">
            {financials.groupProducts.map((product, index) => {
              const quantity = Number(product?.quantity ?? 1) || 1;
              const name = String(
                product?.product_name ??
                  product?.productName ??
                  t("web.provider.bookings.groupFinancials.productFallback", { index: index + 1 }),
              );
              const total =
                Number(product?.total_price ?? product?.totalPrice) ||
                multiplyMoney(Number(product?.unit_price ?? product?.unitPrice ?? 0), quantity);
              return (
                <li key={`${name}-${index}`} className="flex justify-between gap-2">
                  <span>
                    {t("web.provider.bookings.groupFinancials.productQty", { name, quantity })}
                  </span>
                  <span className="font-medium">{formatMoney(total)}</span>
                </li>
              );
            })}
          </ul>
        </BookingSectionCard>
      ) : null}
    </>
  );
}
